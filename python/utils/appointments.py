import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Literal

import pandas as pd
from dateutil import parser
from googleapiclient.discovery import build
from loguru import logger

from utils.clients import TEST_NAMES
from utils.database import (
    get_all_evaluators_npi_map,
    get_db,
    get_npi_to_name_map,
    put_appointment_in_db,
)
from utils.google import google_authenticate, send_gmail

DAEvalType = Literal["EVAL", "DA", "DAEVAL"]


class SyncReporter:
    """Collects synchronization errors and sends a summary email."""

    def __init__(self):
        """Initialize empty lists for different error types."""
        self.time_mismatches: list[dict[str, Any]] = []
        self.missing_in_gcal: list[dict[str, Any]] = []
        self.missing_npis: list[str] = []

    def log_time_mismatch(
        self,
        appointment_idx: int,
        appointment_id: str,
        client_name: str,
        client_id: int,
        found_time: datetime,
        expected_time: datetime,
    ):
        """Log a time mismatch error."""
        self.time_mismatches.append(
            {
                "appointment_idx": appointment_idx,
                "appointment_id": appointment_id,
                "client_name": client_name,
                "client_id": client_id,
                "found_time": found_time,
                "expected_time": expected_time,
            }
        )

    def log_missing_in_gcal(
        self,
        name: str,
        client_id: int,
        start_time: datetime,
        evaluator_name: str,
        appointment_id: str,
    ):
        """Log an appointment missing in Google Calendar."""
        self.missing_in_gcal.append(
            {
                "name": name,
                "client_id": client_id,
                "start_time": start_time,
                "evaluator_name": evaluator_name,
                "appointment_id": appointment_id,
            }
        )

    def log_missing_npi(self, calendar_id: str):
        """Log a missing NPI for a calendar ID."""
        self.missing_npis.append(calendar_id)

    def has_errors(self) -> bool:
        """Check if any errors have been logged."""
        return any([self.time_mismatches, self.missing_in_gcal, self.missing_npis])

    def send_report(self, recipient_email: str):
        """Send a summary email of all logged errors."""
        if not self.has_errors():
            logger.debug("No errors to report. Skipping email.")
            return

        logger.info("Errors logged. Preparing email.")

        text_summary = "Errors were detected during the appointment sync."
        html_content = ""

        if self.missing_npis:
            html_content += "<h3>Missing NPIs</h3>"
            html_content += (
                "<p>The following calendar emails do not have an NPI mapping:</p>"
            )
            html_content += (
                "<ul>"
                + "".join([f"<li>{email}</li>" for email in self.missing_npis])
                + "</ul>"
            )

        if self.missing_in_gcal:
            html_content += "<h3>Appointments Missing in Google Calendar</h3>"
            html_content += (
                "<p>These appointments are in TA but not found on any calendar:</p><ul>"
            )
            for item in self.missing_in_gcal:
                html_content += (
                    f"<li><b>{item['name']}</b> (ID: {item['client_id']}) @ {item['start_time']} "
                    f"<br>&nbsp;&nbsp;<i>Expected Evaluator: {item['evaluator_name']}</i>"
                    f"<br>&nbsp;&nbsp;<i>Appt ID: {item.get('appointment_id', 'N/A')}</i></li>"
                )
            html_content += "</ul>"

        if self.time_mismatches:
            html_content += "<h3>Time Mismatches (>1hr difference)</h3>"
            html_content += "<p>The TA start time differs significantly from the calendar start time:</p><ul>"
            for item in self.time_mismatches:
                html_content += (
                    f"<li><b>{item['client_name']}</b> (ID: {item['client_id']}): GCal is {item['found_time']}, "
                    f"TA has {item['expected_time']} "
                    f"(Appt ID: {item.get('appointment_id', 'N/A')})</li>"
                )
            html_content += "</ul>"

        html_content += f"<p>This email was generated and sent automatically.</p>"

        send_gmail(
            message_text=text_summary,
            subject=f"Appointment Sync Errors - {datetime.now().strftime('%Y-%m-%d')}",
            to_addr=recipient_email,
            from_addr="me",
            html=html_content,
        )


def should_skip_appointment(appointment: pd.Series) -> bool:
    """Skip test clients, 'Reports' CPT code, or cancelled appointments."""
    name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
    cpt = re.sub(r"\D", "", appointment["NAME"])
    cancelled = isinstance(appointment["CANCELBYNAME"], str)

    return name in TEST_NAMES or "96130" in cpt or cancelled


def clear_all_appointments_from_db():
    """Deletes all appointments from the database to prepare for a fresh sync."""
    db_connection = get_db()
    try:
        with db_connection:
            with db_connection.cursor() as cursor:
                logger.warning("Clearing all data from 'emr_appointment' table...")
                cursor.execute("DELETE FROM emr_appointment")
                db_connection.commit()
        logger.info("Database cleared successfully.")
    except Exception:
        logger.exception("Critical Error: Failed to clear appointments from database.")
        raise  # Stop execution to prevent inserting duplicates on top of old data


def batch_search_calendar_events(
    service,
    calendars: list[dict],
    appointments_df: pd.DataFrame,
    reporter: SyncReporter,
) -> dict[int, dict]:
    """Search Google Calendar events in batches by date.

    Returns dict mapping appointment index to event details (id, title, calendar_id).
    """
    results = {}

    if appointments_df.empty:
        return results

    # Calculate search window
    timestamps = pd.to_datetime(appointments_df["STARTTIME"])
    min_time = timestamps.min().to_pydatetime()
    max_time = timestamps.max().to_pydatetime()

    # Add buffer: -1 day start, +1 day end to handle timezone shifts
    search_start = (min_time - timedelta(days=1)).isoformat() + "Z"
    search_end = (max_time + timedelta(days=2)).isoformat() + "Z"

    appointments_by_date = defaultdict(list)
    for idx, appointment in appointments_df.iterrows():
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        date_key = start_time.date()
        appointments_by_date[date_key].append((idx, appointment))

    logger.info(f"Searching calendars from {search_start} to {search_end}...")

    for calendar in calendars:
        calendar_id = calendar["id"]
        all_events = []
        page_token = None

        try:
            while True:
                events_result = (
                    service.events()
                    .list(
                        calendarId=calendar_id,
                        timeMin=search_start,
                        timeMax=search_end,
                        singleEvents=True,
                        orderBy="startTime",
                        pageToken=page_token,
                    )
                    .execute()
                )

                events = events_result.get("items", [])
                all_events.extend(events)

                page_token = events_result.get("nextPageToken")
                if not page_token:
                    break
        except Exception:
            logger.exception(
                f"Error searching calendar {calendar.get('summary', 'Unknown')}"
            )
            continue

        if not all_events:
            continue

        events_by_date = defaultdict(list)
        for event in all_events:
            event_start = event["start"].get("dateTime", event["start"].get("date"))
            if not event_start:
                continue

            # Parse and strip tzinfo for date grouping
            dt = parser.parse(event_start)
            if dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)  # Convert to naive for date matching

            events_by_date[dt.date()].append((dt, event))

        # We iterate our requested appointments and look up the relevant day in our fetched events
        for date_key, date_appointments in appointments_by_date.items():
            # Only look at events that happened on this specific day
            day_events = events_by_date.get(date_key, [])

            for idx, appointment in date_appointments:
                if idx in results:  # Already found in a previous calendar
                    continue

                client_id = appointment["CLIENT_ID"]
                start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
                if start_time.tzinfo is not None:
                    start_time = start_time.replace(tzinfo=None)

                # Iterate only the events for this specific day
                for event_dt, event in day_events:
                    description = event.get("description", "")

                    # Check Client ID
                    if str(client_id) not in description:
                        continue

                    # Check Time Difference
                    time_diff = abs((event_dt - start_time).total_seconds())

                    if time_diff <= 3600:  # 1 hour tolerance
                        results[idx] = {
                            "event_id": event["id"],
                            "title": event.get("summary", "No title"),
                            "calendar_id": calendar_id,
                        }
                        break
                    else:
                        # Log specific mismatch
                        logger.warning(
                            f"Found event with Client ID {client_id} but wrong time: "
                            f"Event: {event_dt}, Expected: {start_time}, Diff: {int(time_diff)}s"
                        )
                        reporter.log_time_mismatch(
                            appointment_idx=idx,
                            appointment_id=str(appointment["APPOINTMENT_ID"]),
                            client_name=re.sub(
                                r"[\d\(\)]", "", appointment["NAME"]
                            ).strip(),
                            client_id=client_id,
                            found_time=event_dt,
                            expected_time=start_time.strftime("%m/%d %I:%M %p"),
                        )
                        break

    return results


def prepare_appointments_from_csv(
    reporter: SyncReporter,
    trusted_ids: set[str],
    ignored_ids: set[str],
):
    """Load CSV, filter invalid rows, and merge with Google Calendar data."""

    creds = google_authenticate()
    service = build("calendar", "v3", credentials=creds)

    appointments_df = pd.read_csv("temp/input/clients-appointments.csv")
    appointments_df = appointments_df.sort_values(
        by=["CLIENT_ID", "STARTTIME"]
    ).reset_index(drop=True)
    appointments_df["gcal_event_id"] = None
    appointments_df["gcal_title"] = None
    appointments_df["gcal_calendar_id"] = None

    npi_map = get_npi_to_name_map()

    now = datetime.now()

    # Track dates to detect next-day 'appointments' for insurance
    client_date_set = set()
    for _, app in appointments_df.iterrows():
        client_id = app["CLIENT_ID"]
        start_date = pd.to_datetime(app["STARTTIME"]).date()
        client_date_set.add((client_id, start_date))

    indices_to_drop = set()
    last_90000_appointment_date: dict[int, datetime] = {}

    for idx, appointment in appointments_df.iterrows():
        if str(appointment["APPOINTMENT_ID"]) in ignored_ids:
            logger.info(
                f"Skipping ignored appointment {appointment['APPOINTMENT_ID']}."
            )
            indices_to_drop.add(idx)
            continue

        if should_skip_appointment(appointment):
            indices_to_drop.add(idx)
            continue

        client_id = appointment["CLIENT_ID"]
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        cpt_string = re.sub(r"\D", "", appointment["NAME"])

        # Filter out 90000 CPT codes within 6 months of each other
        if re.search(r"90000", cpt_string):
            last_date = last_90000_appointment_date.get(client_id)
            if last_date and (start_time.date() - last_date.date()) < timedelta(
                days=182
            ):
                logger.info(
                    f"Skipping appointment for client {client_id} on {start_time.date()} "
                    f"with 90000 CPT code as it is within 6 months of a previous one on {last_date.date()}."
                )
                indices_to_drop.add(idx)
                continue
            last_90000_appointment_date[client_id] = start_time

        # Skip if client was seen previous day (insurance 'appointment')
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

    if indices_to_drop:
        appointments_df = appointments_df.drop(index=list(indices_to_drop)).reset_index(
            drop=True
        )

    four_weeks_ago = now - timedelta(weeks=4)
    four_weeks_from_now = now + timedelta(weeks=4)

    appointments_df = appointments_df[
        (pd.to_datetime(appointments_df["STARTTIME"]) >= four_weeks_ago)
        & (pd.to_datetime(appointments_df["STARTTIME"]) <= four_weeks_from_now)
    ]

    if appointments_df.empty:
        logger.info("No valid appointments found in the processing window.")
        return appointments_df

    logger.info(f"Searching Google Calendar for {len(appointments_df)} appointments...")

    calendar_list = service.calendarList().list().execute()
    calendars = calendar_list.get("items", [])

    search_results = batch_search_calendar_events(
        service, calendars, appointments_df, reporter
    )

    mismatched_indices = {item["appointment_idx"] for item in reporter.time_mismatches}

    # Apply results and log missing events
    indices_to_drop = set()
    for idx, appointment in appointments_df.iterrows():
        if not isinstance(idx, int):
            continue

        appointment_id = str(appointment["APPOINTMENT_ID"])
        is_trusted = appointment_id in trusted_ids

        result = search_results.get(idx)
        if result:
            appointments_df.at[idx, "gcal_event_id"] = result["event_id"]
            appointments_df.at[idx, "gcal_title"] = result["title"]
            appointments_df.at[idx, "gcal_calendar_id"] = result["calendar_id"]
        elif idx in mismatched_indices:
            if is_trusted:
                logger.warning(
                    f"Trusting import for appointment {appointment_id} despite time mismatch."
                )
            else:
                # We already logged the mismatch, so just add to drop list
                indices_to_drop.add(idx)
        else:
            name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
            start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()

            raw_npi = appointment.get("NPI")

            try:
                npi_int = int(raw_npi) if pd.notna(raw_npi) else 0
            except ValueError:
                npi_int = 0

            evaluator_name = npi_map.get(npi_int, f"Unknown NPI ({raw_npi})")

            logger.error(
                f"Not found in any calendar: {name} ({appointment['CLIENT_ID']}) "
                f"at {start_time.strftime('%m/%d %I:%M %p')} "
                f"[Expected Evaluator: {evaluator_name}]"
            )

            reporter.log_missing_in_gcal(
                name=name,
                client_id=appointment["CLIENT_ID"],
                start_time=start_time.strftime("%m/%d %I:%M %p"),
                evaluator_name=evaluator_name,
                appointment_id=appointment_id,
            )

            if is_trusted:
                logger.warning(
                    f"Trusting import for appointment {appointment_id} despite missing in GCal."
                )
            else:
                indices_to_drop.add(idx)

    if indices_to_drop:
        appointments_df = appointments_df.drop(index=list(indices_to_drop)).reset_index(
            drop=True
        )

    return appointments_df


def insert_appointments_with_gcal(appointment_sync_data: dict[str, list[str]] | None):
    """Sync appointments from CSV to database using Google Calendar for evaluator matching."""
    trusted_ids, ignored_ids = set(), set()

    if appointment_sync_data is not None:
        trusted_appointment_ids = appointment_sync_data.get("trusted_appointment_ids")
        if trusted_appointment_ids is not None:
            trusted_ids = set(str(aid) for aid in trusted_appointment_ids)

        ignored_appointment_ids = appointment_sync_data.get("ignored_appointment_ids")
        if ignored_appointment_ids is not None:
            ignored_ids = set(str(aid) for aid in ignored_appointment_ids)

    email_for_errors = os.getenv("ERROR_EMAILS", "")

    reporter = SyncReporter()

    logger.info("Processing appointments from CSV and Google Calendar...")
    appointments_df = prepare_appointments_from_csv(
        reporter,
        trusted_ids=trusted_ids,
        ignored_ids=ignored_ids,
    )

    if appointments_df.empty:
        logger.warning("No appointments to insert.")
        return

    logger.info(f"Inserting {len(appointments_df)} appointments into database...")
    npi_cache = get_all_evaluators_npi_map()

    for _, appointment in appointments_df.iterrows():
        appointment_id = str(appointment["APPOINTMENT_ID"])
        client_id = appointment["CLIENT_ID"]
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        end_time = pd.to_datetime(appointment["ENDTIME"]).to_pydatetime()
        cancelled = type(appointment["CANCELBYNAME"]) == str
        gcal_event_id = appointment.get("gcal_event_id")
        gcal_event_title = appointment.get("gcal_title")
        gcal_calendar_id = appointment.get("gcal_calendar_id")

        is_trusted = appointment_id in trusted_ids

        evaluatorNpi = None
        gcal_location = None
        gcal_daeval = None

        if gcal_calendar_id:
            evaluatorNpi = npi_cache.get(gcal_calendar_id)
            if evaluatorNpi is None:
                logger.error(
                    f"NPI not found for calendar ID (email): {gcal_calendar_id}"
                )
                reporter.log_missing_npi(gcal_calendar_id)
                continue

            # Ensure gcal_event_title is a string, default to empty if not
            if not isinstance(gcal_event_title, str):
                gcal_event_title = ""

            gcal_location, gcal_daeval = parse_location_and_type(gcal_event_title)

        elif is_trusted:
            # Fallback to CSV NPI
            raw_npi = appointment.get("NPI")
            try:
                evaluatorNpi = int(raw_npi) if pd.notna(raw_npi) else None
            except ValueError:
                evaluatorNpi = None

            if not evaluatorNpi:
                logger.warning(
                    f"Skipping trusted import for {client_id}: No valid NPI in CSV."
                )
                continue
        else:
            if not gcal_calendar_id:
                logger.error(f"No calendar ID found for event ID: {gcal_event_id}")
            if not gcal_event_title:
                logger.error(f"No title found for event ID: {gcal_event_id}")
            continue

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

    reporter.send_report(email_for_errors)


def parse_location_and_type(title: str) -> tuple[str | None, DAEvalType | None]:
    """Extract location code and evaluation type from calendar title format [LOC-TYPE].

    Examples:
        "[COL-E]" -> ("COL", "EVAL")
        "[NYC-DE]" -> ("NYC", "DAEVAL")
        "[V]" -> (None, "DA")
    """
    match = re.search(r"\[([A-Z]+)-([A-Z]+)\]", title)

    evaluation_type_map: dict[str, DAEvalType] = {
        "E": "EVAL",
        "D": "DA",
        "DE": "DAEVAL",
    }

    if match:
        location = match.group(1)
        if location == "COLUMBIA":
            location = "COL"

        return (
            location,
            evaluation_type_map.get(match.group(2)),
        )

    elif "[V]" in title:  # Virtual can only be DA
        return None, "DA"

    return None, None
