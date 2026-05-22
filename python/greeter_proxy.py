import asyncio
import os
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from loguru import logger

from utils.constants import TABLE_EVALUATOR, TABLE_GREETER_PROXY_STATE, TABLE_USER
from utils.database import get_db
from utils.webhook import verify_openphone_signature

router = APIRouter()

OPENPHONE_API_KEY = os.getenv("OPENPHONE_API_TOKEN", "")
OPENPHONE_NUMBER_ID = os.getenv("OPENPHONE_NUMBER_ID", "")
OPENPHONE_GREETER_NUMBER_ID = os.getenv("OPENPHONE_GREETER_NUMBER_ID", "")
OPENPHONE_GREETER_SIGNING_SECRET = os.getenv("OPENPHONE_GREETER_SIGNING_SECRET", "")

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url="https://api.openphone.com/v1",
            headers={
                "Authorization": OPENPHONE_API_KEY,
                "Content-Type": "application/json",
            },
        )
    return _http_client


async def send_sms(to: str, body: str) -> None:
    client = get_http_client()
    logger.debug(f"Sending SMS to {to} from {OPENPHONE_GREETER_NUMBER_ID}: {body!r}")
    try:
        response = await client.post(
            "/messages",
            json={"content": body, "from": OPENPHONE_GREETER_NUMBER_ID, "to": [to]},
        )
        response.raise_for_status()
        logger.info(f"SMS sent to {to} (status {response.status_code})")
    except Exception as e:
        logger.error(f"Failed to send SMS to {to}: {e}")
        raise


def get_participant(phone: str) -> tuple[str, str] | None:
    """Returns (role, name) for the given phone number, or None if unknown."""
    logger.debug(f"Looking up participant for phone {phone}")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # evaluator: emr_user has a phone AND has a linked emr_evaluator record
            cur.execute(
                f"""
                SELECT u.name, ev.npi
                FROM {TABLE_USER} u
                LEFT JOIN {TABLE_EVALUATOR} ev ON u.email = ev.email
                WHERE u.phone_number = %s
                LIMIT 1
                """,
                (phone,),
            )
            row = cur.fetchone()
            if not row:
                logger.debug(f"No user found for phone {phone}")
                return None
            name = row["name"] or phone
            if row["npi"] is not None:
                logger.debug(f"Phone {phone} identified as evaluator: {name!r}")
                return ("evaluator", name)
            # greeter: emr_user has phone AND is_greeter = 1
            cur.execute(
                f"SELECT is_greeter FROM {TABLE_USER} WHERE phone_number = %s LIMIT 1",
                (phone,),
            )
            greeter_row = cur.fetchone()
            if greeter_row and greeter_row["is_greeter"]:
                logger.debug(f"Phone {phone} identified as greeter: {name!r}")
                return ("greeter", name)
            logger.debug(
                f"Phone {phone} matched user {name!r} but has no evaluator or greeter role"
            )
            return None
    finally:
        conn.close()


def get_all_greeter_phones() -> list[str]:
    logger.debug("Fetching all greeter phone numbers")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT phone_number FROM {TABLE_USER} WHERE is_greeter = 1 AND phone_number IS NOT NULL"
            )
            phones = [row["phone_number"] for row in cur.fetchall()]
            logger.debug(f"Found {len(phones)} greeter(s)")
            return phones
    finally:
        conn.close()


def get_last_active_evaluator() -> str | None:
    logger.debug("Fetching last active evaluator from state")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT value FROM {TABLE_GREETER_PROXY_STATE} WHERE `key` = 'last_active_evaluator' LIMIT 1"
            )
            row = cur.fetchone()
            phone = row["value"] if row else None
            logger.debug(f"Last active evaluator: {phone}")
            return phone
    finally:
        conn.close()


def set_last_active_evaluator(phone: str) -> None:
    logger.debug(f"Setting last active evaluator to {phone}")
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {TABLE_GREETER_PROXY_STATE} (`key`, value)
                VALUES ('last_active_evaluator', %s)
                ON DUPLICATE KEY UPDATE value = %s
                """,
                (phone, phone),
            )
        conn.commit()
        logger.debug(f"Last active evaluator updated to {phone}")
    finally:
        conn.close()


async def process_message(sender_phone: str, message_body: str) -> None:
    logger.info(f"Processing message from {sender_phone}: {message_body!r}")
    participant = get_participant(sender_phone)
    if not participant:
        logger.error(
            f"Unknown number {sender_phone} — no matching evaluator or greeter role"
        )
        return

    role, name = participant
    logger.info(f"Routing message from {role} {name!r} ({sender_phone})")

    if role == "evaluator":
        set_last_active_evaluator(sender_phone)
        greeter_phones = get_all_greeter_phones()
        if not greeter_phones:
            logger.warning(
                "No greeters found - message from evaluator will not be forwarded"
            )
            return
        logger.info(f"Forwarding evaluator message to {len(greeter_phones)} greeter(s)")
        tasks = [
            send_sms(phone, f"[{name}] {message_body}") for phone in greeter_phones
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        failures = [r for r in results if isinstance(r, Exception)]
        if failures:
            logger.error(
                f"{len(failures)}/{len(greeter_phones)} SMS(es) failed to send"
            )
        else:
            logger.info(f"All {len(greeter_phones)} greeter SMS(es) sent successfully")
    elif role == "greeter":
        target = get_last_active_evaluator()
        if target:
            logger.info(f"Forwarding greeter message to evaluator {target}")
            await send_sms(target, f"[{name}] {message_body}")
        else:
            logger.error("No active evaluator found — cannot forward greeter reply")


@router.post("/pyapi/greeter-proxy/sms")
async def handle_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    openphone_signature: Annotated[str | None, Header()] = None,
) -> dict:
    if not openphone_signature:
        logger.warning("Webhook received with no signature header")
        raise HTTPException(status_code=401, detail="Missing signature")

    await verify_openphone_signature(
        request, openphone_signature, OPENPHONE_GREETER_SIGNING_SECRET
    )

    payload = await request.json()
    event_type = payload.get("type")
    logger.debug(f"Received webhook event: {event_type}")

    if event_type != "message.received":
        logger.debug(f"Ignoring non-message event: {event_type}")
        return {"status": "ignored"}

    data = payload.get("data", {}).get("object", {})
    sender_phone = data.get("from")
    message_body = data.get("body")

    if not sender_phone or not message_body:
        logger.warning(
            f"Webhook payload missing from/body: from={sender_phone!r}, body={message_body!r}"
        )
        return {"status": "ignored"}

    logger.info(f"Queuing message from {sender_phone}")
    background_tasks.add_task(process_message, sender_phone, message_body)

    return {"status": "accepted"}
