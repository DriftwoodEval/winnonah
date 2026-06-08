from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from httpx import AsyncClient, HTTPStatusError
from loguru import logger
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

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
        templates = list(cursor.fetchall())

    if not templates:
        logger.info("No active reminder templates found.")
        return

    # Process standard templates most-immediate-first so late-scheduled appointments
    # only get the closest applicable reminder, not every template that covers them.
    templates.sort(
        key=lambda t: (
            bool(t.get("isNoReplyFollowUp") or t.get("isConfirmedFollowUp")),
            t["sendOffsetHours"],
        )
    )

    logger.info(f"Processing {len(templates)} active reminder template(s).")
    total_sent = 0
    total_skipped = 0
    already_sent_this_cycle: set[int] = set()

    with connection.cursor() as cursor:
        for template in templates:
            trigger_keyword = (
                f"%{template['triggerKeyword']}%"
                if template["triggerKeyword"]
                else None
            )
            trigger_da_eval = template.get("triggerDaEval")

            raw_location = template.get("triggerLocationKey")
            if isinstance(raw_location, str):
                raw_location = json.loads(raw_location)
            trigger_location_keys = raw_location or None

            max_lead_time = datetime.now() + timedelta(
                hours=template["sendOffsetHours"]
            )

            template_name = template.get("name") or f"id={template['id']}"
            if template.get("isNoReplyFollowUp"):
                template_type = "no-reply follow-up"
            elif template.get("isConfirmedFollowUp"):
                template_type = "confirmed follow-up"
            else:
                criteria_parts = []
                if template.get("triggerKeyword"):
                    criteria_parts.append(f"keyword={template['triggerKeyword']!r}")
                if trigger_da_eval:
                    criteria_parts.append(f"daEval={trigger_da_eval}")
                if trigger_location_keys:
                    criteria_parts.append(f"locations={trigger_location_keys}")
                template_type = f"standard ({', '.join(criteria_parts) or 'global'})"
            logger.info(
                f"Template [{template_name}] ({template_type}): "
                f"window={template['sendOffsetHours']}h, "
                f"cutoff={max_lead_time.strftime('%Y-%m-%d %H:%M')}"
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
                    AND a.doNotRemind = 0
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
                    AND a.doNotRemind = 0
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
                if trigger_location_keys:
                    location_clause = f"a.locationKey IN ({', '.join(['%s'] * len(trigger_location_keys))})"
                    location_params = tuple(trigger_location_keys)
                else:
                    location_clause = "1=1"
                    location_params = ()

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
                    AND a.doNotRemind = 0
                    AND a.placeholder = 0
                    AND a.billingOnly = 0
                    AND (
                        (%s IS NOT NULL AND a.calendarEventTitle LIKE %s)
                        OR
                        (
                            (%s IS NOT NULL OR %s)
                            AND (%s IS NULL OR a.daEval = %s)
                            AND {location_clause}
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
                    bool(trigger_location_keys),
                    trigger_da_eval,
                    trigger_da_eval,
                    *location_params,
                    max_lead_time,
                )

            cursor.execute(query, params)
            pending_appointments = cursor.fetchall()

            is_standard = not template.get("isNoReplyFollowUp") and not template.get(
                "isConfirmedFollowUp"
            )
            if is_standard and already_sent_this_cycle:
                deferred = [
                    a
                    for a in pending_appointments
                    if a["id"] in already_sent_this_cycle
                ]
                pending_appointments = [
                    a
                    for a in pending_appointments
                    if a["id"] not in already_sent_this_cycle
                ]
                if deferred:
                    logger.info(
                        f"Template [{template_name}]: deferred {len(deferred)} appointment(s) already handled by a more immediate template this cycle."
                    )

            logger.info(
                f"Template [{template_name}]: {len(pending_appointments)} appointment(s) matched."
            )

            for appt in pending_appointments:
                client_label = f"{appt.get('firstName', '')} {appt.get('lastName', '')} (client {appt['clientId']}, appt {appt['id']})"
                appt_date = (
                    appt["startTime"].strftime("%Y-%m-%d %H:%M")
                    if appt.get("startTime")
                    else "unknown date"
                )

                if not appt.get("phoneNumber"):
                    logger.warning(
                        f"Skipping [{template_name}] for {client_label} on {appt_date}: no phone number."
                    )
                    total_skipped += 1
                    continue

                message = format_message(template["messageTemplate"], appt)

                message_id = await send_sms(appt["phoneNumber"], message)
                logger.info(
                    f"Sent [{template_name}] to {client_label} on {appt_date} "
                    f"(msg_id={message_id})."
                )
                total_sent += 1
                if is_standard:
                    already_sent_this_cycle.add(appt["id"])

                try:
                    cursor.execute(
                        f"INSERT INTO {TABLE_APPOINTMENT_REMINDER_LOGS}(appointmentId, clientId, reminderTemplateId, openphoneMessageId, sentAt) VALUES (%s, %s, %s, %s, NOW())",
                        (appt["id"], appt["clientId"], template["id"], message_id),
                    )
                except Exception as e:
                    logger.error(f"Failed to log reminder for {client_label}: {e}")

        connection.commit()

        logger.info(
            f"Reminder cycle complete: {total_sent} sent, {total_skipped} skipped (no phone)."
        )


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


async def is_first_reply_since_reminder(
    message_id: str | None,
    sent_at: datetime,
    client_phone: str,
) -> bool:
    """Returns True if no other incoming reply exists in this conversation since sent_at."""
    http = get_http_client()

    normalized = client_phone if client_phone.startswith("+") else f"+1{client_phone}"
    sent_at_utc = (
        sent_at.replace(tzinfo=UTC)
        if sent_at.tzinfo is None
        else sent_at.astimezone(UTC)
    )

    params = [
        ("phoneNumberId", OPENPHONE_NUMBER_ID),
        ("participants[]", normalized),
        ("maxResults", 25),
        ("createdAfter", sent_at_utc.isoformat()),
    ]

    try:
        response = await http.get("/messages", params=params)
        response.raise_for_status()
        messages = response.json().get("data", [])

        for msg in messages:
            if msg.get("direction") != "incoming":
                continue
            if msg.get("id") == message_id:
                continue
            return False

        return True
    except Exception as e:
        logger.error(f"Failed to check prior replies from OpenPhone: {e}")
        return True


@provide_connection
async def handle_incoming_reply(
    phone_number: str,
    incoming_text: str,
    message_id: str | None,
    connection: Connection[DictCursor],
):
    clean_phone = phone_number.removeprefix("+1")

    with connection.cursor() as cursor:
        # Find the most recent unconfirmed appointment for this client
        query = f"""
            SELECT a.id as appointment_id, t.confirmationReply, a.startTime,
                   a.calendarEventId, a.calendarEventTitle,
                   o.prettyName AS officeLabel, o.locationPhrase AS officeLocationPhrase,
                   l.sentAt AS lastReminderSentAt, c.fullName
            FROM {TABLE_APPOINTMENT} a
            JOIN {TABLE_CLIENT} c ON a.clientId = c.id
            LEFT JOIN {TABLE_OFFICE} o ON a.locationKey = o.`key`
            JOIN {TABLE_APPOINTMENT_REMINDER_LOGS} l ON a.id = l.appointmentId
            JOIN {TABLE_APPOINTMENT_REMINDER_TEMPLATES} t ON l.reminderTemplateId = t.id
            WHERE c.phoneNumber = %s
            AND a.confirmedAt IS NULL
            AND a.cancelled = 0
            AND a.rescheduled = 0
            AND a.doNotRemind = 0
            AND a.startTime > NOW()
            ORDER BY l.sentAt DESC
            LIMIT 1
        """
        cursor.execute(query, (clean_phone,))
        context = cursor.fetchone()

        if not context:
            return

        appt_date = (
            context["startTime"].strftime("%Y-%m-%d %H:%M")
            if context.get("startTime")
            else "unknown date"
        )

        first_reply = await is_first_reply_since_reminder(
            message_id, context["lastReminderSentAt"], clean_phone
        )
        if not first_reply:
            logger.debug(
                f"Reply from {phone_number} ignored: not the first reply since last reminder for appt {context['appointment_id']}."
            )
            return

        if is_confirmation(incoming_text):
            logger.info(
                f"Confirmation received from {phone_number} ({context['fullName']}) for appt {context['appointment_id']} on {appt_date}: {incoming_text!r}."
            )

            if context["confirmationReply"]:
                message = format_message(context["confirmationReply"], context)
                await send_sms(phone_number, message)
                logger.info(f"Sent confirmation reply to {phone_number}.")

            cursor.execute(
                f"UPDATE {TABLE_APPOINTMENT} SET confirmedAt = NOW() WHERE id = %s",
                (context["appointment_id"],),
            )

            event_id = context.get("calendarEventId")
            current_title = context.get("calendarEventTitle") or ""
            if event_id and "[CONFIRMED]" not in current_title:
                new_title = f"{current_title} [CONFIRMED]".strip()
                try:
                    update_gcal_event_title(event_id, new_title)
                    logger.info(
                        f"Updated calendar event {event_id} title to {new_title!r}."
                    )
                except Exception as e:
                    logger.error(f"Failed to update calendar event title: {e}")
        else:
            logger.debug(
                f"Non-confirmation reply from {phone_number} ignored: {incoming_text!r}"
            )

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
    message_id = data.get("id")

    background_tasks.add_task(
        handle_incoming_reply, sender_phone, message_body, message_id
    )

    return {"status": "ok"}
