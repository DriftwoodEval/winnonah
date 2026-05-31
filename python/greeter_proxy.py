import os
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from googleapiclient.discovery import build
from loguru import logger

from utils.constants import TABLE_USER
from utils.database import get_db
from utils.google import google_authenticate
from utils.webhook import verify_openphone_signature

router = APIRouter()

OPENPHONE_API_KEY = os.getenv("OPENPHONE_API_TOKEN", "")
OPENPHONE_GREETER_NUMBER_ID = os.getenv("OPENPHONE_GREETER_NUMBER_ID", "")
OPENPHONE_GREETER_SIGNING_SECRET = os.getenv("OPENPHONE_GREETER_SIGNING_SECRET", "")
GREETER_SCHEDULE_SHEET_ID = os.getenv("GREETER_SCHEDULE_SHEET_ID", "")

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client  # noqa: PLW0603
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


def get_todays_schedule() -> list[dict]:
    """Returns today's entries from the Google Sheet: [{location, name}]."""
    today_str = datetime.now().strftime("%m-%d-%y")
    logger.debug(f"Fetching schedule for {today_str}")

    creds = google_authenticate()
    service = build("sheets", "v4", credentials=creds)
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=GREETER_SCHEDULE_SHEET_ID, range="A:F")
        .execute()
    )
    rows = result.get("values", [])

    schedule = []
    for row in rows:
        if len(row) < 6:
            continue
        date_val = (row[0] or "").strip()
        if date_val != today_str:
            continue
        location = (row[3] or "").strip()
        name = (row[5] or "").strip()
        if name:
            schedule.append({"location": location, "name": name})

    logger.info(f"Found {len(schedule)} schedule entries for today")
    return schedule


def is_known_user(phone: str) -> bool:
    """Returns True if the phone number belongs to a user in emr_user."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id FROM {TABLE_USER} WHERE phone_number = %s LIMIT 1",
                (phone,),
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


def lookup_phone_by_first_name(first_name: str) -> str | None:
    """Returns the phone number for a user whose name starts with first_name."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT phone_number FROM {TABLE_USER} WHERE name = %s OR name LIKE %s LIMIT 1",
                (first_name, f"{first_name} %"),
            )
            row = cur.fetchone()
            return row["phone_number"] if row else None
    finally:
        conn.close()


async def process_message(sender_phone: str) -> None:
    """Reply to sender with today's schedule."""
    logger.info(f"Processing message from {sender_phone}")
    if not is_known_user(sender_phone):
        logger.warning(f"Ignoring message from unknown number {sender_phone}")
        return
    schedule = get_todays_schedule()

    lines = []

    if not schedule:
        lines.append("No schedule found for today.")
    else:
        lines.append("Today's greeters are")
        for entry in schedule:
            phone = lookup_phone_by_first_name(entry["name"])
            phone_str = phone or "No number on file"
            lines.append(f"{entry['location']} - {entry['name']} - {phone_str}")
        lines.append("Please click the number after the appropriate office to get in touch with your greeter.")
    await send_sms(sender_phone, "\n".join(lines))


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

    if not sender_phone:
        logger.warning("Webhook payload missing from field")
        return {"status": "ignored"}

    logger.info(f"Queuing schedule reply to {sender_phone}")
    background_tasks.add_task(process_message, sender_phone)

    return {"status": "accepted"}
