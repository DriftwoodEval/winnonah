import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from dateutil import parser
from googleapiclient.discovery import build
from loguru import logger

from utils.clients import TEST_NAMES
from utils.google import google_authenticate


def should_skip_appointment(appointment: pd.Series, now: datetime) -> bool:
    """Checks if an appointment should be skipped."""
    name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
    cpt = re.sub(r"\D", "", appointment["NAME"])
    start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
    cancelled = isinstance(appointment["CANCELBYNAME"], str)

    two_weeks_ago = now - timedelta(weeks=2)
    two_weeks_from_now = now + timedelta(weeks=2)

    return (
        name in TEST_NAMES
        or "96130" in cpt
        or start_time < two_weeks_ago
        or start_time > two_weeks_from_now
        or cancelled
    )


def check_and_merge_appointments():
    """Checks Google Calendar for appointments and merges with CSV data."""
    limit = 5
    creds = google_authenticate()

    service = build("calendar", "v3", credentials=creds)

    appointments_df = pd.read_csv("temp/input/clients-appointments.csv")
    appointments_df["gcal_event_id"] = None
    appointments_df["gcal_title"] = None
    appointments_df["gcal_calendar_id"] = None

    now = datetime.now()
    client_date_set = set()
    for _, app in appointments_df.iterrows():
        client_id = app["CLIENT_ID"]
        start_date = pd.to_datetime(app["STARTTIME"]).date()
        client_date_set.add((client_id, start_date))

    # Get list of all calendars
    calendar_list = service.calendarList().list().execute()
    calendars = calendar_list.get("items", [])

    logger.debug(f"Searching across {len(calendars)} calendars...")

    for idx, appointment in appointments_df.iterrows():
        client_id = appointment["CLIENT_ID"]
        name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        if should_skip_appointment(appointment, now):
            continue

        current_app_date = start_time.date()
        previous_app_date = current_app_date - timedelta(days=1)

        if (client_id, previous_app_date) in client_date_set:
            logger.warning(
                f"Skipping search for {name} ({client_id}) on {current_app_date.strftime('%Y-%m-%d')} "
                f"as they were seen on the previous day."
            )
            continue

        logger.debug(f"Searching for Client ID: {client_id} ({name})...")
        # logger.debug(f"Expected start time: {start_time}")

        found = False
        for calendar in calendars:
            calendar_id = calendar["id"]

            try:
                # Search for events on this day
                events_result = (
                    service.events()
                    .list(
                        calendarId=calendar_id,
                        timeMin=start_time.isoformat() + "Z",
                        timeMax=(start_time + timedelta(days=1)).isoformat() + "Z",
                        singleEvents=True,
                        orderBy="startTime",
                    )
                    .execute()
                )

                events = events_result.get("items", [])

                # Check if client ID is in the description
                for event in events:
                    description = event.get("description", "")
                    if str(client_id) in description:
                        event_start = event["start"].get(
                            "dateTime", event["start"].get("date")
                        )
                        event_start_dt = parser.parse(event_start)

                        # Make timezone-naive for comparison if needed
                        if event_start_dt.tzinfo is not None:
                            event_start_dt = event_start_dt.replace(tzinfo=None)
                        if start_time.tzinfo is not None:
                            start_time = start_time.replace(tzinfo=None)

                        time_diff = abs((event_start_dt - start_time).total_seconds())

                        if time_diff <= 3600:  # 1 hour tolerance
                            appointments_df.at[idx, "gcal_event_id"] = event["id"]
                            appointments_df.at[idx, "gcal_title"] = event.get(
                                "summary", "No title"
                            )
                            appointments_df.at[idx, "gcal_calendar_id"] = calendar_id

                            # logger.success(f"Found: Event ID: {event['id']}")
                            # logger.success(f"Title: {event.get('summary', 'No title')}")
                            # logger.success(
                            #     f"Calendar: {calendar.get('summary', 'Unknown')}"
                            # )
                            # logger.success(f"Event start time: {event_start_dt}")
                            found = True
                            break  # Stop after first match
                        else:
                            # TODO: send error
                            logger.warning(
                                f"Found event with Client ID but wrong time:"
                            )
                            logger.warning(
                                f"Event start: {event_start_dt}, Expected: {start_time}"
                            )
                            logger.warning(f"Time difference: {time_diff} seconds")

                if found:
                    break  # Stop searching other calendars

            except Exception:
                logger.exception(
                    f"Error searching calendar {calendar.get('summary', 'Unknown')}"
                )

        if not found:
            logger.error(
                f"Not found in any calendar with matching time (expected: {start_time}"
            )

    return appointments_df


def parse_location_and_type(title: str) -> Tuple[Optional[str], Optional[str]]:
    """Extracts location and evaluation type from calendar title."""
    match = re.search(r"\[([A-Z]+)-([A-Z]+)\]", title)
    if match:
        location = match.group(1)
        if location == "COLUMBIA":
            location = "COL"
        evaluation_type_map = {"E": "EVAL", "D": "DA", "DE": "DAEVAL"}
        return (
            location,
            evaluation_type_map.get(match.group(2)),
        )
    elif "[V]" in title:  # Virtual can only be DA
        return None, "DA"
    return None, None
