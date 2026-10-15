"""SCDHHS Special Accommodations notices.

When the appointment sync schedules a new appointment for an active Medicaid
(SCM) or BabyNet client who does not speak English, a pending notice is queued
for staff to approve or deny on the Issues page. Approved notices are emailed to
SCDHHS (the client's name, Medicaid number, and language) so they can arrange an
interpreter. Each client is queued once.
"""

from collections.abc import Iterable

from loguru import logger

from utils.constants import SPECIAL_ACCOMMODATIONS_EMAIL
from utils.database import (
    get_approved_special_accommodations_notices,
    get_non_english_medicaid_clients_for_notice,
    mark_special_accommodations_notice_sent,
    queue_special_accommodations_notice,
)
from utils.google import send_gmail

# Sent from the records inbox, the same address the records-request job uses.
FROM_ADDR = "records@driftwoodeval.com"


def build_accommodation_email(
    client_name: str, medicaid_number: str, language: str
) -> tuple[str, str]:
    """Returns (subject, body). The subject contains "secure" so Paubox
    encrypts the message on the way out."""
    subject = f"Secure: interpreter needed for {client_name}"
    body = (
        "A client scheduled for an evaluation with Driftwood Evaluation Center "
        "does not speak English and will need an interpreter.\n\n"
        f"Client name: {client_name}\n"
        f"Medicaid number: {medicaid_number}\n"
        f"Language: {language}\n"
    )
    return subject, body


def queue_special_accommodations(client_ids: Iterable[int]) -> None:
    """Queue a pending notice for each newly scheduled non-English Medicaid or
    BabyNet client in client_ids that has no notice yet. Staff approve or deny
    them on the Issues page; nothing is emailed until approval."""
    for client in get_non_english_medicaid_clients_for_notice(client_ids):
        queue_special_accommodations_notice(
            client["id"], client["language"], client["insuranceNumber"]
        )
        logger.info(f"Queued Special Accommodations notice for client {client['id']}")


def send_approved_special_accommodations() -> None:
    """Email SCDHHS for each approved notice, then mark it sent. A failed send
    stays approved and is retried on the next run."""
    for notice in get_approved_special_accommodations_notices():
        name = f"{notice['firstName']} {notice['lastName']}".strip()
        subject, body = build_accommodation_email(
            name, notice["medicaidNumber"], notice["language"]
        )
        result = send_gmail(
            message_text=body,
            subject=subject,
            to_addr=SPECIAL_ACCOMMODATIONS_EMAIL,
            from_addr=FROM_ADDR,
        )
        if result is None:
            logger.error(
                f"Failed to send Special Accommodations notice for client {notice['clientId']}"
            )
            continue

        mark_special_accommodations_notice_sent(notice["clientId"])
        logger.info(
            f"Sent Special Accommodations notice for client {notice['clientId']}"
        )
