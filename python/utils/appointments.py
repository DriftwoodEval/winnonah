import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from dateutil import parser
from googleapiclient.discovery import build
from loguru import logger

from utils.clients import TEST_NAMES
from utils.database import get_all_evaluators_npi_map, get_db, put_appointment_in_db
from utils.google import google_authenticate


def should_skip_appointment(appointment: pd.Series, now: datetime) -> bool:
    """Skip test clients, 'Reports' CPT code, out-of-range dates, or cancelled appointments."""
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


def get_existing_appointments_from_db() -> Dict[str, Dict]:
    """Loads appointments from the database."""
    db_connection = get_db()
    try:
        with db_connection:
            with db_connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, clientId, evaluatorNpi, startTime, endTime,
                           calendarEventId, cancelled, daEval, asdAdhd, locationKey
                    FROM emr_appointment
                    WHERE startTime >= DATE_SUB(NOW(), INTERVAL 2 WEEK)
                      AND startTime <= DATE_ADD(NOW(), INTERVAL 2 WEEK)
                """)
                results = cursor.fetchall()
                return {row["id"]: row for row in results}
    except Exception:
        logger.exception("Error fetching existing appointments from database")
        return {}


def appointment_needs_update(csv_row: pd.Series, db_row: Optional[Dict]) -> bool:
    """Check if appointment is new or has changes requiring an update."""
    if db_row is None:
        return True  # New appointment

    # Check if key fields have changed
    csv_start = pd.to_datetime(csv_row["STARTTIME"]).to_pydatetime()
    csv_end = pd.to_datetime(csv_row["ENDTIME"]).to_pydatetime()
    csv_cancelled = isinstance(csv_row["CANCELBYNAME"], str)
    csv_npi = int(csv_row["NPI"])

    # Skip if calendar event exists and nothing changed
    if (
        db_row.get("calendarEventId")
        and db_row["clientId"] == csv_row["CLIENT_ID"]
        and db_row["startTime"] == csv_start
        and db_row["endTime"] == csv_end
        and db_row["cancelled"] == csv_cancelled
        and db_row["evaluatorNpi"] == csv_npi
    ):
        return False

    return True


def batch_search_calendar_events(
    service, calendars: List[Dict], appointments_df: pd.DataFrame
) -> Dict[int, Dict]:
    """Search Google Calendar events in batches by date.

    Returns dict mapping appointment index to event details (id, title, calendar_id).
    """
    results = {}

    # Group by date to minimize API calls
    appointments_by_date = defaultdict(list)
    for idx, appointment in appointments_df.iterrows():
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        date_key = start_time.date()
        appointments_by_date[date_key].append((idx, appointment))

    # Search each calendar once per date
    for calendar in calendars:
        calendar_id = calendar["id"]

        for date_key, date_appointments in appointments_by_date.items():
            try:
                # Fetch all events for this day
                day_start = datetime.combine(date_key, datetime.min.time())
                day_end = day_start + timedelta(days=1)

                events_result = (
                    service.events()
                    .list(
                        calendarId=calendar_id,
                        timeMin=day_start.isoformat() + "Z",
                        timeMax=day_end.isoformat() + "Z",
                        singleEvents=True,
                        orderBy="startTime",
                    )
                    .execute()
                )

                events = events_result.get("items", [])

                # Match events to appointments by client ID and time
                for idx, appointment in date_appointments:
                    if idx in results:  # Already found
                        continue

                    client_id = appointment["CLIENT_ID"]
                    start_time = pd.to_datetime(
                        appointment["STARTTIME"]
                    ).to_pydatetime()

                    for event in events:
                        description = event.get("description", "")
                        if str(client_id) not in description:
                            continue

                        event_start = event["start"].get(
                            "dateTime", event["start"].get("date")
                        )
                        event_start_dt = parser.parse(event_start)

                        # Compare times (timezone-naive)
                        if event_start_dt.tzinfo is not None:
                            event_start_dt = event_start_dt.replace(tzinfo=None)
                        if start_time.tzinfo is not None:
                            start_time = start_time.replace(tzinfo=None)

                        time_diff = abs((event_start_dt - start_time).total_seconds())

                        if time_diff <= 3600:  # 1 hour tolerance
                            results[idx] = {
                                "event_id": event["id"],
                                "title": event.get("summary", "No title"),
                                "calendar_id": calendar_id,
                            }
                            break
                        else:
                            # TODO: send error email
                            logger.warning(
                                f"Found event with Client ID {client_id} but wrong time: "
                                f"Event: {event_start_dt}, Expected: {start_time}, "
                                f"Diff: {time_diff}s"
                            )

            except Exception:
                logger.exception(
                    f"Error searching calendar {calendar.get('summary', 'Unknown')}"
                )

    return results


def check_and_merge_appointments():
    """Match CSV appointments with Google Calendar events and filter out invalid ones.

    Returns DataFrame with appointments that need processing, enriched with gcal data.
    """
    creds = google_authenticate()
    service = build("calendar", "v3", credentials=creds)

    appointments_df = pd.read_csv("temp/input/clients-appointments.csv")
    appointments_df["gcal_event_id"] = None
    appointments_df["gcal_title"] = None
    appointments_df["gcal_calendar_id"] = None

    now = datetime.now()

    existing_appointments = get_existing_appointments_from_db()
    logger.debug(
        f"Found {len(existing_appointments)} existing appointments in database"
    )

    # Track dates to detect next-day 'appointments' for insurance
    client_date_set = set()
    for _, app in appointments_df.iterrows():
        client_id = app["CLIENT_ID"]
        start_date = pd.to_datetime(app["STARTTIME"]).date()
        client_date_set.add((client_id, start_date))

    skipped_existing = 0
    indices_to_drop = set()

    for idx, appointment in appointments_df.iterrows():
        appointment_id = appointment["APPOINTMENT_ID"]

        if should_skip_appointment(appointment, now):
            indices_to_drop.add(idx)
            continue

        existing = existing_appointments.get(appointment_id)
        if not appointment_needs_update(appointment, existing):
            indices_to_drop.add(idx)
            skipped_existing += 1
            continue

        # Skip if client was seen previous day, this is likely an insurance 'appointment'
        client_id = appointment["CLIENT_ID"]
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        current_app_date = start_time.date()
        previous_app_date = current_app_date - timedelta(days=1)

        if (client_id, previous_app_date) in client_date_set:
            name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
            logger.warning(
                f"Skipping {name} ({client_id}) on {current_app_date.strftime('%Y-%m-%d')} "
                f"as they were seen on the previous day."
            )
            indices_to_drop.add(idx)
            continue

    logger.info(f"Skipped {skipped_existing} unchanged appointments from database")

    if indices_to_drop:
        appointments_df = appointments_df.drop(index=indices_to_drop).reset_index(
            drop=True
        )

    if appointments_df.empty:
        logger.info("No appointments need calendar search")
        return appointments_df

    # Get all calendars and batch search
    calendar_list = service.calendarList().list().execute()
    calendars = calendar_list.get("items", [])
    logger.debug(f"Searching across {len(calendars)} calendars...")

    search_results = batch_search_calendar_events(service, calendars, appointments_df)

    # Apply results and log missing events
    indices_to_drop = set()
    for idx, appointment in appointments_df.iterrows():
        result = search_results.get(idx)
        if result:
            appointments_df.at[idx, "gcal_event_id"] = result["event_id"]
            appointments_df.at[idx, "gcal_title"] = result["title"]
            appointments_df.at[idx, "gcal_calendar_id"] = result["calendar_id"]
        else:
            name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
            start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
            # TODO: Send error email
            logger.error(
                f"Not found in any calendar: {name} (Client: {appointment['CLIENT_ID']}) "
                f"at {start_time.strftime('%Y-%m-%d %H:%M')}"
            )
            indices_to_drop.add(idx)

    if indices_to_drop:
        appointments_df = appointments_df.drop(index=indices_to_drop).reset_index(
            drop=True
        )

    logger.info(f"Inserting {len(appointments_df)} appointments into database")

    return appointments_df


def insert_appointments_with_gcal():
    """Sync appointments from CSV to database using Google Calendar for evaluator matching."""
    logger.info("Inserting appointments with Google Calendar data")
    appointments_df = check_and_merge_appointments()

    npi_cache = get_all_evaluators_npi_map()

    for _, appointment in appointments_df.iterrows():
        appointment_id = appointment["APPOINTMENT_ID"]
        client_id = appointment["CLIENT_ID"]
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        end_time = pd.to_datetime(appointment["ENDTIME"]).to_pydatetime()
        cancelled = type(appointment["CANCELBYNAME"]) == str
        gcal_event_id = appointment.get("gcal_event_id")
        gcal_event_title = appointment.get("gcal_title")
        gcal_calendar_id = appointment.get("gcal_calendar_id")

        evaluatorNpi = npi_cache.get(gcal_calendar_id)

        if evaluatorNpi is None:
            logger.error(f"NPI not found for calendar ID (email): {gcal_calendar_id}")
            # TODO: send error
            continue

        gcal_location, gcal_daeval = parse_location_and_type(gcal_event_title)

        put_appointment_in_db(
            appointment_id,
            client_id,
            evaluatorNpi,
            start_time,
            end_time,
            location=gcal_location,
            da_eval=gcal_daeval,
            cancelled=cancelled,
            gcal_event_id=gcal_event_id,
        )


def parse_location_and_type(title: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract location code and evaluation type from calendar title format [LOC-TYPE].

    Examples:
        "[COL-E]" -> ("COL", "EVAL")
        "[NYC-DE]" -> ("NYC", "DAEVAL")
        "[V]" -> (None, "DA")
    """
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
