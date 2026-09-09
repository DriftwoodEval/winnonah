"""SCDHHS Special Accommodations notices.

When the appointment sync schedules a new appointment for an active Medicaid
(SCM) client who does not speak English, we email SCDHHS the client's name,
Medicaid number, and language so they can arrange an interpreter. The notice
goes out once per client.
"""

from collections.abc import Iterable

from loguru import logger

from utils.constants import SPECIAL_ACCOMMODATIONS_EMAIL
from utils.database import (
    get_non_english_medicaid_clients_for_notice,
    record_special_accommodations_notice,
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


def notify_special_accommodations(client_ids: Iterable[int]) -> None:
    """Email SCDHHS for each newly scheduled non-English Medicaid client in
    client_ids that has not been reported yet, then record the send."""
    clients = get_non_english_medicaid_clients_for_notice(client_ids)
    if not clients:
        return

    for client in clients:
        name = f"{client['firstName']} {client['lastName']}".strip()
        medicaid_number = client["insuranceNumber"]
        language = client["language"]

        subject, body = build_accommodation_email(name, medicaid_number, language)
        result = send_gmail(
            message_text=body,
            subject=subject,
            to_addr=SPECIAL_ACCOMMODATIONS_EMAIL,
            from_addr=FROM_ADDR,
        )
        if result is None:
            logger.error(
                f"Failed to send Special Accommodations notice for client {client['id']}"
            )
            continue

        record_special_accommodations_notice(client["id"], language, medicaid_number)
        logger.info(f"Sent Special Accommodations notice for client {client['id']}")
