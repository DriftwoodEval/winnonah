"""A synchronous client for the Quo (OpenPhone) messaging API.

Requests are rate limited and transient failures are retried. Async callers
run it in a worker thread, for example `await asyncio.to_thread(client.send_text, ...)`.
The request and response shaping lives in `driftwood_common.quo`.
"""

from __future__ import annotations

from datetime import date, datetime

import requests
from loguru import logger
from ratelimit import RateLimitException, limits
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    retry_if_result,
    stop_after_attempt,
    wait_exponential,
)

from driftwood_common.constants import BUSINESS_TIMEZONE
from driftwood_common.quo import (
    API_BASE,
    InvalidPhoneNumberError,
    MessageDirection,
    build_messages_query,
    build_send_payload,
    parse_messages,
    to_e164,
)
from driftwood_common.timezone import business_date_to_utc

RATE_LIMIT_CALLS = 10
RATE_LIMIT_PERIOD = 1
REQUEST_TIMEOUT_SECONDS = 30


def before_sleep_loguru(retry_state: RetryCallState) -> None:
    """Custom callback to log retries using Loguru."""
    if retry_state.outcome is None:
        return

    fn_name = retry_state.fn.__name__ if retry_state.fn else "unknown_function"

    if retry_state.outcome.failed:
        verb = "raised"
        value = retry_state.outcome.exception()
    else:
        verb = "returned"
        value = retry_state.outcome.result()

    sleep_time = retry_state.next_action.sleep if retry_state.next_action else 0.0

    logger.debug(
        f"Retrying {fn_name} "
        f"in {sleep_time:0.2f}s "
        f"after attempt {retry_state.attempt_number}. "
        f"Last attempt {verb}: {value}"
    )


def should_continue_polling(status: str) -> bool:
    """
    Retry Condition:
    - Return True (Retry) if status is pending (queued, sent).
    - Return False (Stop) if status is final (delivered, undelivered).
    """
    pending_statuses = {"queued", "sent"}
    return status in pending_statuses


class NotEnoughCreditsError(requests.HTTPError):
    """Custom exception for payment/credit limits."""

    def __init__(self, message="Organization has insufficient prepaid credits."):
        super().__init__(message)


def is_transient_error(exception: Exception) -> bool:
    """Check if the exception is a transient error that should be retried."""
    if isinstance(exception, requests.HTTPError) and exception.response is not None:
        # Do not retry on 400, 401, 403, 404, 422
        return exception.response.status_code not in [400, 401, 403, 404, 422]
    return isinstance(exception, (requests.ConnectionError, RateLimitException))


class QuoClient:
    """Sends and reads texts through the Quo API.

    Give it `main_number` (an E.164 number) or `phone_number_id` (Quo's id for
    the sending line), whichever you have. Texts are sent from `main_number`
    when set, otherwise from the phone number id.
    """

    def __init__(
        self,
        api_key: str,
        *,
        main_number: str | None = None,
        phone_number_id: str | None = None,
        default_user: str | None = None,
        business_timezone: str = BUSINESS_TIMEZONE,
    ):
        if main_number is None and phone_number_id is None:
            raise ValueError("QuoClient needs a main_number or a phone_number_id")
        self.main_number = main_number
        self.default_user = default_user
        self.business_timezone = business_timezone
        self._phone_number_id = phone_number_id
        self._phone_number_id_resolved = phone_number_id is not None

        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Authorization": api_key,
            }
        )

    _retry_network = retry(
        retry=retry_if_exception_type(Exception) & retry_if_result(is_transient_error),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        before_sleep=before_sleep_loguru,
    )

    _retry_poll_delivery = retry(
        retry=retry_if_result(should_continue_polling),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        stop=stop_after_attempt(10),
        before_sleep=before_sleep_loguru,
    )

    @limits(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
    @_retry_network
    def get_text_info(self, message_id: str) -> dict:
        """Retrieves raw info dict. Retries only on network errors."""
        url = f"{API_BASE}messages/{message_id}"
        response = self.session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json().get("data", {})

    @_retry_poll_delivery
    def _poll_delivery_status(self, message_id: str) -> str:
        """
        Internal helper: Fetches status.
        Tenacity retries if status is 'queued'/'sent'.
        Stops immediately if 'delivered' or 'undelivered'.
        """
        info = self.get_text_info(message_id)
        return info.get("status", "unknown")

    def check_text_delivered(self, message_id: str) -> bool:
        """
        Blocks until message is delivered, failed, or times out.
        Returns True only if strictly 'delivered'.
        """
        try:
            final_status = self._poll_delivery_status(message_id)
            if final_status == "delivered":
                return True

            logger.warning(f"Message {message_id} ended with status: {final_status}")
            return False

        except Exception as e:
            logger.error(f"Failed to verify delivery for {message_id}: {e}")
            return False

    @limits(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
    @_retry_network
    def _fetch_phone_number_id(self) -> str | None:
        """Fetch the Quo phone number ID for the main number."""
        url = f"{API_BASE}phone-numbers"
        response = self.session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        for pn in response.json().get("data", []):
            if pn.get("number") == self.main_number:
                return pn["id"]
        logger.warning(f"Could not find phone number ID for {self.main_number}")
        return None

    def _get_phone_number_id(self) -> str | None:
        """Return the cached phone number ID, fetching it if needed."""
        if not self._phone_number_id_resolved:
            self._phone_number_id = self._fetch_phone_number_id()
            self._phone_number_id_resolved = True
        return self._phone_number_id

    def has_client_replied(
        self, client_phone: str, since: date | datetime | None = None
    ) -> bool:
        """Return True if the client has sent us an incoming message, optionally since a given date."""
        return len(self._get_messages(client_phone, "incoming", since)) > 0

    def get_sent_texts(
        self, client_phone: str, since: date | datetime | None = None
    ) -> list[tuple[str, datetime]]:
        """Return the (text, sent time) of messages we sent the client, optionally since a given date.

        Reads Quo's message history, so it includes texts our own DB never
        recorded (e.g. a failed state write after an earlier run's text).
        """
        return [
            (msg.get("text") or "", sent_at)
            for msg, sent_at in self._get_messages(client_phone, "outgoing", since)
        ]

    def has_sent_message(
        self,
        client_phone: str,
        content: str,
        since: date | datetime | None = None,
    ) -> bool:
        """Return True if we already sent the client this exact text, optionally since a given date."""
        wanted = " ".join(content.split())
        return any(
            " ".join(text.split()) == wanted
            for text, _ in self.get_sent_texts(client_phone, since)
        )

    def get_messages(
        self, client_phone: str, since: date | datetime | None = None
    ) -> list[tuple[dict, datetime]]:
        """Return recent messages in both directions as (message, created time) pairs.

        Each message dict carries its `direction` and `id`. Returns an empty
        list when the lookup fails or the number is malformed.
        """
        return self._get_messages(client_phone, None, since)

    def _get_messages(
        self,
        client_phone: str,
        direction: MessageDirection | None,
        since: date | datetime | None,
    ) -> list[tuple[dict, datetime]]:
        """Fetch recent messages as (message, created time) pairs, newest-window of 25.

        `since` is a business-local calendar date (counted from midnight) or a
        timezone-aware datetime. Returns an empty list when the lookup fails or
        the number is malformed.
        """
        phone_number_id = self._get_phone_number_id()
        if not phone_number_id:
            return []

        try:
            clean_phone = to_e164(client_phone)
        except InvalidPhoneNumberError:
            logger.warning(
                f"Cannot check {direction or 'all'} messages for malformed number: {client_phone}"
            )
            return []

        try:
            if isinstance(since, datetime):
                since_dt = since
            elif since is not None:
                since_dt = business_date_to_utc(since, self.business_timezone)
            else:
                since_dt = None
            params = build_messages_query(
                phone_number_id, clean_phone, direction=direction, since=since_dt
            )
            response = self.session.get(
                f"{API_BASE}messages", params=params, timeout=REQUEST_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            # Client-side filter as a fallback in case the API ignores createdAfter
            return parse_messages(response.json().get("data", []), since_dt)
        except Exception as e:
            logger.error(
                f"Failed to check {direction or 'all'} messages for {client_phone}: {e}"
            )
            return []

    @limits(calls=RATE_LIMIT_CALLS, period=RATE_LIMIT_PERIOD)
    @_retry_network
    def send_text(
        self,
        message: str,
        to_number: str,
        from_number: str | None = None,
        user_blame: str | None = None,
        mark_done: bool = False,
    ) -> dict | None:
        """Sends text. Retries on network errors. Fails fast on payment errors."""
        sender = from_number or self.main_number or self._phone_number_id
        if sender is None:
            raise ValueError("No from_number given and the client has no sending line")
        if user_blame is None:
            user_blame = self.default_user

        to_number_clean = to_e164(to_number)

        url = f"{API_BASE}messages"
        payload = build_send_payload(
            message,
            sender,
            to_number_clean,
            user_id=user_blame,
            mark_done=mark_done,
        )

        try:
            logger.info(f"Sending message to {to_number_clean}...")
            response = self.session.post(
                url, json=payload, timeout=REQUEST_TIMEOUT_SECONDS
            )

            if response.status_code == 402:
                raise NotEnoughCreditsError

            if response.status_code == 400:
                logger.error(f"Bad Request to Quo: {response.text}")

            response.raise_for_status()
            return response.json().get("data")

        except NotEnoughCreditsError:
            # Catch explicitly to avoid the Retry decorator handling it
            logger.error("Organization has insufficient credits. Cannot send.")
            raise
