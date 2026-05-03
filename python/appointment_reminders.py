from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from httpx import AsyncClient
from loguru import logger
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

from utils.database import provide_connection

logger.add("logs/appointment-reminders.log", rotation="500 MB")


class Settings(BaseSettings):
    openphone_api_token: str = Field(default=...)
    openphone_number_id: str = Field(default=...)
    openphone_signing_secret: str = Field(default=...)

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()


@provide_connection
def is_within_quiet_window(connection) -> bool:
    """Checks if we are in the quiet window."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT quietWindowStart, quietWindowEnd FROM emr_appointment_reminder_settings LIMIT 1"
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
    else:  # Handles overnight window (e.g. 10PM to 8AM)
        return now >= start or now <= end


def format_message(template: str, appointment: dict) -> str:
    """Replaces placeholders with actual data."""
    variables = {
        "{startTime}": appointment["startTime"].strftime("%I:%M %p"),
        "{date}": appointment["startTime"].strftime("%A, %B %d"),
    }

    for placeholder, value in variables.items():
        template = template.replace(placeholder, str(value))
    return template


@provide_connection
def process_reminders(connection: Connection[DictCursor]) -> None:
    # if is_within_quiet_window():
    #     logger.info("Within quiet window, skipping reminders.")
    #     return

    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM emr_reminder_templates WHERE isActive = 1")
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
                hours=template["sendOffsetHours"] + 2
            )

            if template.get("isNoReplyFollowUp"):
                # No-reply follow-up logic:
                # 1. This template hasn't been sent yet.
                # 2. At least one OTHER template WAS sent but NOT confirmed.
                # 3. GLOBAL: Applies to ANY appointment regardless of type/location.
                query = """
                    SELECT a.*, c.firstName, c.lastName, c.preferredName, c.phoneNumber
                    FROM emr_appointment a
                    JOIN emr_client c ON a.clientId = c.id
                    LEFT JOIN emr_reminder_logs l_this ON a.id = l_this.appointmentId AND l_this.reminderTemplateId = %s
                    JOIN emr_reminder_logs l_prev ON a.id = l_prev.appointmentId AND l_prev.reminderTemplateId != %s
                    WHERE l_this.id IS NULL
                    AND l_prev.confirmedAt IS NULL
                    AND a.cancelled = 0
                    AND a.placeholder = 0
                    AND a.startTime <= %s
                    AND a.startTime >= NOW()
                """
                params = (
                    template["id"],
                    template["id"],
                    max_lead_time,
                )
            else:
                query = """
                    SELECT a.*, c.firstName, c.lastName, c.preferredName, c.phoneNumber
                    FROM emr_appointment a
                    JOIN emr_client c ON a.clientId = c.id
                    LEFT JOIN emr_reminder_logs l ON a.id = l.appointmentId AND l.reminderTemplateId = %s
                    WHERE l.id IS NULL
                    AND a.cancelled = 0
                    AND a.placeholder = 0
                    AND (
                        (%s IS NOT NULL AND a.calendarEventTitle LIKE %s)
                        OR
                        (%s IS NOT NULL AND %s IS NOT NULL AND a.daEval = %s AND a.locationKey = %s)
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
                    trigger_location_key,
                    max_lead_time,
                )

            cursor.execute(query, params)
            pending_appointments = cursor.fetchall()

            for appt in pending_appointments:
                if not appt.get("phoneNumber"):
                    print(f"Skipping Appt {appt['id']}: No phone number for client.")
                    continue

                message = format_message(template["messageTemplate"], appt)

                print(message)

                try:
                    cursor.execute(
                        "INSERT INTO emr_reminder_logs (appointmentId, clientId, reminderTemplateId, sentAt) VALUES (%s, %s, %s, NOW())",
                        (appt["id"], appt["clientId"], template["id"]),
                    )
                except Exception as e:
                    logger.error(f"Failed to send reminder: {e}")

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

    if re.search(pattern, incoming_text, re.IGNORECASE):
        return True

    return False


@provide_connection
def handle_incoming_reply(
    phone_number: str, incoming_text: str, connection: Connection[DictCursor]
):
    clean_phone = phone_number.removeprefix("+1")

    with connection.cursor() as cursor:
        query = """
            SELECT l.id as log_id, l.appointmentId, t.confirmationReply,
                   a.startTime
            FROM emr_reminder_logs l
            JOIN emr_reminder_templates t ON l.reminderTemplateId = t.id
            JOIN emr_appointment a ON l.appointmentId = a.id
            JOIN emr_client c ON a.clientId = c.id
            WHERE c.phoneNumber = %s
            AND l.confirmedAt IS NULL
            AND a.startTime > NOW()
            ORDER BY l.sentAt DESC
            LIMIT 1
        """
        cursor.execute(query, (clean_phone,))
        context = cursor.fetchone()

        if not context:
            logger.debug(f"No active reminder context found for {phone_number}")
            return

        if is_confirmation(incoming_text):
            if context["confirmationReply"]:
                message = format_message(context["confirmationReply"], context)

                print(message)

            cursor.execute(
                "UPDATE emr_reminder_logs SET confirmedAt = NOW() WHERE id = %s",
                (context["log_id"],),
            )
        else:
            logger.debug("Message does not appear to be a confirmation or denial")
            # TODO: Flag this?

        connection.commit()


async def reminder_cron():
    """Background loop to process reminders every 15 minutes."""
    while True:
        logger.info("Starting reminder dispatch cycle...")
        try:
            process_reminders()
        except Exception as e:
            logger.error(f"Failed to process reminders: {e}")

        # Wait 15 minutes
        await asyncio.sleep(900)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = AsyncClient(
        base_url="https://api.openphone.com/v1",
        headers={
            "Authorization": os.getenv("OPENPHONE_API_KEY", ""),
            "Content-Type": "application/json",
        },
    )

    task = asyncio.create_task(reminder_cron())

    yield

    # Clean up on shutdown
    task.cancel()
    await app.state.client.aclose()


app = FastAPI(lifespan=lifespan)


async def send_sms(to: str, body: str):
    client: AsyncClient = app.state.client
    try:
        response = await client.post(
            "/messages",
            json={
                "content": body,
                "from": settings.openphone_number_id,
                "to": [to],
            },
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to send SMS to {to}: {e}")
        raise


async def verify_signature(request: Request, signature_header: str):
    try:
        parts = signature_header.split(";")
        if len(parts) != 4:
            raise ValueError("Invalid signature format")
        algo, version, timestamp, received_sig = parts
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid signature format")

    now_ms = int(time.time() * 1000)
    if abs(now_ms - int(timestamp)) > 5 * 60 * 1000:
        raise HTTPException(status_code=401, detail="Signature expired")

    raw_body = await request.body()
    signing_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode()

    secret_bytes = base64.b64decode(settings.openphone_signing_secret)

    expected_hmac = hmac.new(
        secret_bytes, msg=signing_payload, digestmod=hashlib.sha256
    ).digest()

    expected_sig_b64 = base64.b64encode(expected_hmac).decode()

    if not hmac.compare_digest(expected_sig_b64, received_sig):
        raise HTTPException(status_code=401, detail="Signature mismatch")


@app.post("/sms")
async def handle_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    openphone_signature: Annotated[str | None, Header()] = None,
):
    if not openphone_signature:
        raise HTTPException(status_code=401, detail="Missing signature")

    await verify_signature(request, openphone_signature)

    payload = await request.json()

    if payload.get("type") != "message.received":
        return {"status": "ignored"}

    data = payload.get("data", {}).get("object", {})
    sender_phone = data.get("from")
    message_body = data.get("body")

    print(sender_phone, message_body)

    background_tasks.add_task(handle_incoming_reply, sender_phone, message_body)

    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=1234)
