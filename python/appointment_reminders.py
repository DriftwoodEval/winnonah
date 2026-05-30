from __future__ import annotations

import asyncio
import os
import re
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from httpx import AsyncClient, HTTPStatusError
from loguru import logger
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

from utils.clients import TEST_NAMES
from utils.constants import (
    TABLE_APPOINTMENT,
    TABLE_APPOINTMENT_REMINDER_LOGS,
    TABLE_APPOINTMENT_REMINDER_SETTINGS,
    TABLE_APPOINTMENT_REMINDER_TEMPLATES,
    TABLE_CLIENT,
    TABLE_OFFICE,
)
from utils.database import provide_connection
from utils.google import update_gcal_event_title
from utils.webhook import verify_openphone_signature

logger.add(
    "logs/appointment-reminders.log",
    rotation="500 MB",
    filter=lambda r: r["name"] in {"appointment_reminders", "utils.webhook"},
)

OPENPHONE_API_TOKEN = os.getenv("OPENPHONE_API_TOKEN", "")
OPENPHONE_NUMBER_ID = os.getenv("OPENPHONE_NUMBER_ID", "")
OPENPHONE_SIGNING_SECRET = os.getenv("OPENPHONE_SIGNING_SECRET", "")

_http_client: AsyncClient | None = None


def get_http_client() -> AsyncClient:
    global _http_client  # noqa: PLW0603
    if _http_client is None:
        _http_client = AsyncClient(
            base_url="https://api.openphone.com/v1",
            headers={
                "Authorization": OPENPHONE_API_TOKEN,
                "Content-Type": "application/json",
            },
        )
    return _http_client


@provide_connection
def is_within_quiet_window(connection) -> bool:
    """Checks if we are in the quiet window."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT quietWindowStart, quietWindowEnd FROM {TABLE_APPOINTMENT_REMINDER_SETTINGS} LIMIT 1"
        )
        settings = cursor.fetchone()

    if not settings:
        return False

    now = datetime.now().time()
    start = (
        (datetime.min + settings["quietWindowStart"]).time()
        if isinstance(settings["quietWindowStart"], timedelta)
        else settings["quietWindowStart"]
    )
    end = (
        (datetime.min + settings["quietWindowEnd"]).time()
        if isinstance(settings["quietWindowEnd"], timedelta)
        else settings["quietWindowEnd"]
    )

    if start <= end:
        return start <= now <= end
    # Handles overnight window (e.g. 10PM to 8AM)
    return now >= start or now <= end


def format_message(template: str, appointment: dict) -> str:
    """Replaces placeholders with actual data."""
    variables = {
        "$START_TIME": appointment["startTime"].strftime("%I:%M %p"),
        "$DATE": appointment["startTime"].strftime("%A, %B %d"),
        "$OFFICE_NAME": appointment.get("officeLabel") or "",
        "$LOCATION": appointment.get("officeLocationPhrase") or "",
    }

    for placeholder, value in variables.items():
        template = template.replace(placeholder, str(value))
    return template


@provide_connection
async def process_reminders(connection: Connection[DictCursor]) -> None:
    if is_within_quiet_window():
        logger.info("Within quiet window, skipping reminders.")
        return

    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT * FROM {TABLE_APPOINTMENT_REMINDER_TEMPLATES} WHERE isActive = 1"
        )
        templates = cursor.fetchall()

        for template in templates:
            trigger_keyword = (
                f"%{template['triggerKeyword']}%"
                if template["triggerKeyword"]
                else None
            )
            trigger_da_eval = template.get("triggerDaEval")
            trigger_location_key = template.get("triggerLocationKey")

            max_lead_time = datetime.now() + timedelta(
                hours=template["sendOffsetHours"]
            )

            if template.get("isNoReplyFollowUp"):
                # No-reply follow-up logic:
                # 1. This template hasn't been sent yet.
                # 2. Appointment IS NOT confirmed.
                # 3. At least one OTHER template WAS sent.
                # 4. GLOBAL: Applies to ANY appointment regardless of type/location.
                query = f"""
                    SELECT a.*, c.firstName, c.lastName, c.preferredName, c.phoneNumber,
                           o.prettyName AS officeLabel, o.locationPhrase AS officeLocationPhrase
                    FROM {TABLE_APPOINTMENT} a
                    JOIN {TABLE_CLIENT} c ON a.clientId = c.id
                    LEFT JOIN {TABLE_OFFICE} o ON a.locationKey = o.`key`
                    LEFT JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l_this ON a.id = l_this.appointmentId AND l_this.reminderTemplateId = %s
                    JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l_prev ON a.id = l_prev.appointmentId AND l_prev.reminderTemplateId != %s
                    WHERE l_this.id IS NULL
                    AND a.confirmedAt IS NULL
                    AND l_prev.id IS NOT NULL
                    AND a.cancelled = 0
                    AND a.rescheduled = 0
                    AND a.placeholder = 0
                    AND a.billingOnly = 0
                    AND a.startTime <= %s
                    AND a.startTime >= NOW()
                """
                params = (
                    template["id"],
                    template["id"],
                    max_lead_time,
                )
            elif template.get("isConfirmedFollowUp"):
                # Confirmed follow-up logic:
                # 1. This template hasn't been sent yet.
                # 2. Appointment IS confirmed.
                # 3. GLOBAL: Applies to ANY appointment regardless of type/location.
                query = f"""
                    SELECT a.*, c.firstName, c.lastName, c.preferredName, c.phoneNumber,
                           o.prettyName AS officeLabel, o.locationPhrase AS officeLocationPhrase
                    FROM {TABLE_APPOINTMENT} a
                    JOIN {TABLE_CLIENT} c ON a.clientId = c.id
                    LEFT JOIN {TABLE_OFFICE} o ON a.locationKey = o.`key`
                    LEFT JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l_this ON a.id = l_this.appointmentId AND l_this.reminderTemplateId = %s
                    WHERE l_this.id IS NULL
                    AND a.confirmedAt IS NOT NULL
                    AND a.cancelled = 0
                    AND a.rescheduled = 0
                    AND a.placeholder = 0
                    AND a.billingOnly = 0
                    AND a.startTime <= %s
                    AND a.startTime >= NOW()
                """
                params = (
                    template["id"],
                    max_lead_time,
                )
            else:
                # Standard reminder logic:
                # 1. This template hasn't been sent yet.
                # 2. Appointment IS NOT confirmed.
                query = f"""
                    SELECT a.*, c.firstName, c.lastName, c.preferredName, c.phoneNumber,
                           o.prettyName AS officeLabel, o.locationPhrase AS officeLocationPhrase
                    FROM {TABLE_APPOINTMENT} a
                    JOIN {TABLE_CLIENT} c ON a.clientId = c.id
                    LEFT JOIN {TABLE_OFFICE} o ON a.locationKey = o.`key`
                    LEFT JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l ON a.id = l.appointmentId AND l.reminderTemplateId = %s
                    WHERE l.id IS NULL
                    AND a.confirmedAt IS NULL
                    AND a.cancelled = 0
                    AND a.rescheduled = 0
                    AND a.placeholder = 0
                    AND a.billingOnly = 0
                    AND (
                        (%s IS NOT NULL AND a.calendarEventTitle LIKE %s)
                        OR
                        (
                            (%s IS NOT NULL OR %s IS NOT NULL)
                            AND (%s IS NULL OR a.daEval = %s)
                            AND (%s IS NULL OR a.locationKey = %s)
                        )
                    )
                    AND a.startTime <= %s
                    AND a.startTime >= NOW()
                """
                params = (
                    template["id"],
                    trigger_keyword,
                    trigger_keyword,
                    trigger_da_eval,
                    trigger_location_key,
                    trigger_da_eval,
                    trigger_da_eval,
                    trigger_location_key,
                    trigger_location_key,
                    max_lead_time,
                )

            cursor.execute(query, params)
            pending_appointments = cursor.fetchall()

            for appt in pending_appointments:
                # TEMPORARY: only process test clients
                full_name = f"{appt['firstName']} {appt['lastName']}"
                if full_name not in TEST_NAMES:
                    continue

                if not appt.get("phoneNumber"):
                    logger.warning(
                        f"Skipping Appt {appt['id']}: No phone number for client."
                    )
                    continue

                message = format_message(template["messageTemplate"], appt)

                message_id = await send_sms(appt["phoneNumber"], message)

                try:
                    cursor.execute(
                        f"INSERT INTO {TABLE_APPOINTMENT_REMINDER_LOGS}(appointmentId, clientId, reminderTemplateId, openphoneMessageId, sentAt) VALUES (%s, %s, %s, %s, NOW())",
                        (appt["id"], appt["clientId"], template["id"], message_id),
                    )
                except Exception as e:
                    logger.error(f"Failed to log reminder: {e}")

        connection.commit()

        logger.info("Reminders processed successfully.")


def is_confirmation(incoming_text: str) -> bool:
    """
    Checks for a confirmed response with word boundary protection
    and common confirmation emojis.
    """
    thumbs_up_emojis = ["👍", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿", "✅", "✔️"]
    if any(emoji in incoming_text for emoji in thumbs_up_emojis):
        return True

    keywords = ["Y", "YES", "YEAH", "YEA", "CONFIRM", "CONFIRMED"]
    pattern = rf"\b({'|'.join([re.escape(k) for k in keywords])})\b"

    return bool(re.search(pattern, incoming_text, re.IGNORECASE))


def is_rejection(incoming_text: str) -> bool:
    """Checks for a cancellation or denial response."""
    thumbs_down_emojis = ["👎", "👎🏻", "👎🏼", "👎🏽", "👎🏾", "👎🏿", "❌", "🚫"]
    if any(emoji in incoming_text for emoji in thumbs_down_emojis):
        return True

    keywords = [
        "NO",
        "NOPE",
        "CANCEL",
        "CANCELLED",
        "CANT",
        "CAN'T",
        "CANNOT",
        "WONT",
        "WON'T",
        "DECLINE",
        "DECLINED",
    ]
    pattern = rf"\b({'|'.join([re.escape(k) for k in keywords])})\b"
    return bool(re.search(pattern, incoming_text, re.IGNORECASE))


def is_reschedule_request(incoming_text: str) -> bool:
    """Checks for a request to reschedule."""
    keywords = [
        "RESCHEDULE",
        "RESCHEDULED",
        "MOVE",
        "DIFFERENT TIME",
        "DIFFERENT DAY",
        "CHANGE",
    ]
    pattern = rf"\b({'|'.join([re.escape(k) for k in keywords])})\b"
    return bool(re.search(pattern, incoming_text, re.IGNORECASE))


@provide_connection
async def handle_incoming_reply(
    phone_number: str, incoming_text: str, connection: Connection[DictCursor]
):
    clean_phone = phone_number.removeprefix("+1")

    with connection.cursor() as cursor:
        # Find the most recent unconfirmed appointment for this client
        query = f"""
            SELECT a.id as appointment_id, t.confirmationReply, a.startTime,
                   a.calendarEventId, a.calendarEventTitle,
                   o.prettyName AS officeLabel, o.locationPhrase AS officeLocationPhrase
            FROM {TABLE_APPOINTMENT} a
            JOIN {TABLE_CLIENT} c ON a.clientId = c.id
            LEFT JOIN {TABLE_OFFICE} o ON a.locationKey = o.`key`
            JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l ON a.id = l.appointmentId
            JOIN {TABLE_APPOINTMENT_REMINDER_TEMPLATES} t ON l.reminderTemplateId = t.id
            WHERE c.phoneNumber = %s
            AND a.confirmedAt IS NULL
            AND a.cancelled = 0
            AND a.rescheduled = 0
            AND a.startTime > NOW()
            ORDER BY l.sentAt DESC
            LIMIT 1
        """
        cursor.execute(query, (clean_phone,))
        context = cursor.fetchone()

        if not context:
            logger.debug(
                f"No active unconfirmed appointment context found for {phone_number}"
            )
            return

        event_id = context.get("calendarEventId")
        current_title = context.get("calendarEventTitle") or ""
        gcal_tag: str | None = None

        if is_confirmation(incoming_text):
            if context["confirmationReply"]:
                message = format_message(context["confirmationReply"], context)
                await send_sms(phone_number, message)

            cursor.execute(
                f"UPDATE {TABLE_APPOINTMENT} SET confirmedAt = NOW() WHERE id = %s",
                (context["appointment_id"],),
            )
            gcal_tag = "[CONFIRMED]"
        elif is_reschedule_request(incoming_text):
            logger.info(
                f"Reschedule request received for appointment {context['appointment_id']}"
            )
            cursor.execute(
                f"UPDATE {TABLE_APPOINTMENT} SET rescheduled = 1 WHERE id = %s",
                (context["appointment_id"],),
            )
            gcal_tag = "[RESCHEDULE REQUESTED]"
        elif is_rejection(incoming_text):
            logger.info(
                f"Rejection received for appointment {context['appointment_id']}"
            )
            cursor.execute(
                f"UPDATE {TABLE_APPOINTMENT} SET cancelled = 1 WHERE id = %s",
                (context["appointment_id"],),
            )
            gcal_tag = "[DECLINED]"
        else:
            logger.debug(
                "Message does not appear to be a confirmation, rejection, or reschedule request"
            )

        if gcal_tag and event_id and gcal_tag not in current_title:
            new_title = f"{current_title} {gcal_tag}".strip()
            try:
                update_gcal_event_title(event_id, new_title)
            except Exception as e:
                logger.error(f"Failed to update calendar event title: {e}")

        connection.commit()


async def reminder_cron():
    """Background loop to process reminders every 15 minutes."""
    if os.getenv("DEV_TOGGLE"):
        logger.info("Dev mode: Reminder dispatch disabled.")
        return

    while True:
        logger.info("Starting reminder dispatch cycle...")
        try:
            await process_reminders()
        except Exception as e:
            logger.error(f"Failed to process reminders: {e}")

        # Wait 15 minutes
        await asyncio.sleep(900)


async def send_sms(to: str, body: str) -> str | None:
    client = get_http_client()
    try:
        response = await client.post(
            "/messages",
            json={
                "content": body,
                "from": OPENPHONE_NUMBER_ID,
                "to": [to],
                "setInboxStatus": "done",
            },
        )
        response.raise_for_status()
        data = response.json().get("data", {})
        return data.get("id")
    except HTTPStatusError as e:
        logger.error(
            f"Failed to send SMS to {to}: HTTP {e.response.status_code} - {e.response.text}"
        )
        raise
    except Exception as e:
        logger.error(f"Failed to send SMS to {to}: {e}")
        raise


router = APIRouter()


@router.post("/pyapi/appointment-reminders/sms")
async def handle_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    openphone_signature: Annotated[str | None, Header()] = None,
):
    if not openphone_signature:
        logger.warning("Webhook rejected: missing openphone-signature header")
        raise HTTPException(status_code=401, detail="Missing signature")

    await verify_openphone_signature(
        request, openphone_signature, OPENPHONE_SIGNING_SECRET
    )

    payload = await request.json()

    if payload.get("type") != "message.received":
        return {"status": "ignored"}

    data = payload.get("data", {}).get("object", {})
    sender_phone = data.get("from")
    message_body = data.get("body")

    background_tasks.add_task(handle_incoming_reply, sender_phone, message_body)

    return {"status": "ok"}
