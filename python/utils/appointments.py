import os
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Literal

import pandas as pd
from dateutil import parser
from googleapiclient.discovery import build
from loguru import logger

from utils.constants import TEST_NAMES_LOWER
from utils.database import (
    compute_and_store_assessment_snapshot,
    get_all_evaluators_npi_map,
    get_appointments_needing_folder_move,
    get_client_id_to_asd_adhd_map,
    get_client_id_to_dob_map,
    get_in_person_assessments_for_client,
    get_npi_to_name_map,
    get_questionnaire_rules_with_in_person,
    get_sync_report_date,
    put_appointment_in_db,
    put_in_person_assessments_in_db,
    set_client_drive_folder_evaluator,
    set_sync_report_date,
)
from utils.google import google_authenticate, move_drive_folder, send_gmail

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
        cpt_code: str = "N/A",
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
                "cpt_code": cpt_code,
            }
        )

    def log_missing_in_gcal(
        self,
        name: str,
        client_id: int,
        start_time: datetime,
        evaluator_name: str,
        appointment_id: str,
        cpt_code: str = "N/A",
    ):
        """Log an appointment missing in Google Calendar."""
        self.missing_in_gcal.append(
            {
                "name": name,
                "client_id": client_id,
                "start_time": start_time,
                "evaluator_name": evaluator_name,
                "appointment_id": appointment_id,
                "cpt_code": cpt_code,
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

        if get_sync_report_date() == date.today():
            logger.debug("Sync report already sent today. Skipping email.")
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
                    f"<br>&nbsp;&nbsp;<i>Appt ID: {item.get('appointment_id', 'N/A')} | CPT: {item.get('cpt_code', 'N/A')}</i></li>"
                )
            html_content += "</ul>"

        if self.time_mismatches:
            html_content += "<h3>Time Mismatches (>1hr difference)</h3>"
            html_content += "<p>The TA start time differs significantly from the calendar start time:</p><ul>"
            for item in self.time_mismatches:
                html_content += (
                    f"<li><b>{item['client_name']}</b> (ID: {item['client_id']}): GCal is {item['found_time']}, "
                    f"TA has {item['expected_time']} "
                    f"(Appt ID: {item.get('appointment_id', 'N/A')} | CPT: {item.get('cpt_code', 'N/A')})</li>"
                )
            html_content += "</ul>"

        html_content += "<p>This email was generated and sent automatically.</p>"

        send_gmail(
            message_text=text_summary,
            subject=f"Appointment Sync Errors - {datetime.now().strftime('%Y-%m-%d')}",
            to_addr=recipient_email,
            from_addr="tech@driftwoodeval.com",
            html=html_content,
        )
        set_sync_report_date(date.today())


def should_skip_appointment(appointment: pd.Series) -> bool:
    """Skip test clients or 'Reports' CPT code."""
    name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip().lower()
    cpt = re.sub(r"\D", "", appointment["NAME"])

    return name in TEST_NAMES_LOWER or "96130" in cpt


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
                    # Log specific mismatch
                    logger.warning(
                        f"Found event with Client ID {client_id} but wrong time: "
                        f"Event: {event_dt}, Expected: {start_time}, Diff: {int(time_diff)}s"
                    )
                    cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
                    reporter.log_time_mismatch(
                        appointment_idx=idx,
                        appointment_id=str(appointment["APPOINTMENT_ID"]),
                        client_name=re.sub(
                            r"[\d\(\)]", "", appointment["NAME"]
                        ).strip(),
                        client_id=client_id,
                        found_time=event_dt,
                        expected_time=start_time.strftime("%m/%d/%Y %I:%M %p"),
                        cpt_code=cpt_code,
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
    appointments_df["NAME"] = appointments_df["NAME"].fillna("N/A").astype(str)

    appointments_df["STARTTIME_DT"] = pd.to_datetime(appointments_df["STARTTIME"])

    if appointments_df["STARTTIME_DT"].isna().any():
        missing_count = appointments_df["STARTTIME_DT"].isna().sum()
        logger.warning(
            f"Dropping {missing_count} rows with missing or invalid STARTTIME."
        )
        appointments_df = appointments_df.dropna(subset=["STARTTIME_DT"])

    appointments_df = appointments_df.sort_values(
        by=["CLIENT_ID", "STARTTIME_DT"]
    ).reset_index(drop=True)

    for col in ["gcal_event_id", "gcal_title", "gcal_calendar_id"]:
        appointments_df[col] = None

    npi_map = get_npi_to_name_map()

    # Track dates to detect next-day 'appointments' for insurance
    # Exclude cancelled appointments — they shouldn't count as a "real" prior appointment.
    non_cancelled_df = appointments_df[
        ~appointments_df["CANCELBYNAME"].apply(lambda x: isinstance(x, str))
    ]
    client_date_set = set(
        zip(
            non_cancelled_df["CLIENT_ID"],
            non_cancelled_df["STARTTIME_DT"].dt.date,
            strict=False,
        )
    )

    indices_to_drop = set()
    billing_indices = set()
    last_90000_appointment_date: dict[int, datetime] = {}

    for idx, appointment in appointments_df.iterrows():
        appointment_id = str(appointment["APPOINTMENT_ID"])
        client_id = appointment["CLIENT_ID"]
        start_time = appointment["STARTTIME_DT"]
        cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
        name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()

        if appointment_id in ignored_ids:
            indices_to_drop.add(idx)
            continue

        # Appointments before this date predate Google Calendar usage and will never
        # have a matching GCal event. Silently skip rather than require manual ignore list entries.
        if start_time.date() < date(2025, 7, 1):
            indices_to_drop.add(idx)
            continue

        if should_skip_appointment(appointment):
            logger.info(
                f"Flagging {name} ({client_id}) on {start_time.date().strftime('%Y-%m-%d')} "
                f"as billing-only (CPT {cpt_code} skipped from regular import)."
            )
            billing_indices.add(idx)
            continue

        # Flag 90000 CPT duplicates within 6 months as billing-only.
        # Only non-cancelled appointments count as the reference "real" appointment.
        cancelled = isinstance(appointment["CANCELBYNAME"], str)
        if "90000" in cpt_code:
            last_date = last_90000_appointment_date.get(client_id)
            if last_date and (start_time - last_date).days < 182:
                logger.info(
                    f"Flagging appointment for client {client_id} on {start_time.date()} "
                    f"as billing-only (90000 CPT within 6 months of {last_date.date()})."
                )
                billing_indices.add(idx)
                continue
            if not cancelled:
                last_90000_appointment_date[client_id] = start_time

        # Detect next-day billing-only appointments (insurance billing entries in TA)
        previous_app_date = start_time.date() - timedelta(days=1)

        if (client_id, previous_app_date) in client_date_set:
            logger.info(
                f"Flagging {name} ({client_id}) on {start_time.date().strftime('%Y-%m-%d')} "
                f"as a billing-only appointment (seen previous day)."
            )
            billing_indices.add(idx)
            continue

    if indices_to_drop:
        logger.debug(f"Skipped {len(indices_to_drop)} ignored appointment(s).")
    billing_df = appointments_df.loc[list(billing_indices)].copy()
    appointments_df = appointments_df.drop(
        index=list(indices_to_drop | billing_indices)
    )

    if appointments_df.empty:
        logger.info("No valid appointments found in the processing window.")
        return appointments_df, billing_df

    # Separate cancelled appointments — they won't appear in GCal and don't need matching
    cancelled_mask = appointments_df["CANCELBYNAME"].apply(lambda x: isinstance(x, str))
    cancelled_df = appointments_df[cancelled_mask].copy()
    appointments_df = appointments_df[~cancelled_mask].copy().reset_index(drop=True)

    logger.info(f"Searching Google Calendar for {len(appointments_df)} appointments...")

    calendar_list = service.calendarList().list().execute()
    calendars = calendar_list.get("items", [])

    search_results = batch_search_calendar_events(
        service, calendars, appointments_df, reporter
    )

    mismatched_indices = {item["appointment_idx"] for item in reporter.time_mismatches}
    final_drops = set()

    gcal_updates = {}

    for idx, appointment in appointments_df.iterrows():
        if not isinstance(idx, int):
            continue

        appointment_id = str(appointment["APPOINTMENT_ID"])
        is_trusted = appointment_id in trusted_ids
        result = search_results.get(idx)

        if result:
            gcal_updates[idx] = {
                "gcal_event_id": result["event_id"],
                "gcal_title": result["title"],
                "gcal_calendar_id": result["calendar_id"],
            }
        elif idx in mismatched_indices:
            if is_trusted:
                logger.warning(
                    f"Trusting import for appointment {appointment_id} despite time mismatch."
                )
            else:
                # We already logged the mismatch, so just add to drop list
                final_drops.add(idx)
        else:
            name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
            start_time = appointment["STARTTIME_DT"]

            raw_npi = appointment.get("NPI")
            npi_int = (
                int(raw_npi) if pd.notna(raw_npi) and str(raw_npi).isdigit() else 0
            )
            evaluator_name = npi_map.get(npi_int, f"Unknown NPI ({raw_npi})")

            logger.error(
                f"Not found in any calendar: {name} ({appointment['CLIENT_ID']}) "
                f"at {start_time.strftime('%m/%d %I:%M %p')} "
                f"[Expected Evaluator: {evaluator_name}]"
            )

            cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
            reporter.log_missing_in_gcal(
                name=name,
                client_id=appointment["CLIENT_ID"],
                start_time=start_time.strftime("%m/%d %I:%M %p"),
                evaluator_name=evaluator_name,
                appointment_id=appointment_id,
                cpt_code=cpt_code,
            )

            if is_trusted:
                logger.warning(
                    f"Trusting import for appointment {appointment_id} despite missing in GCal."
                )
            else:
                final_drops.add(idx)

    if gcal_updates:
        updates_df = pd.DataFrame.from_dict(gcal_updates, orient="index")
        appointments_df.update(updates_df)

    result_df = appointments_df.drop(index=list(final_drops)).reset_index(drop=True)
    return pd.concat([result_df, cancelled_df], ignore_index=True), billing_df


def insert_appointments_with_gcal(appointment_sync_data: dict[str, list[str]] | None):
    """Sync appointments from CSV to database using Google Calendar for evaluator matching."""
    trusted_ids, ignored_ids = set(), set()

    if appointment_sync_data is not None:
        trusted_appointment_ids = appointment_sync_data.get("trusted_appointment_ids")
        if trusted_appointment_ids is not None:
            trusted_ids = {str(aid) for aid in trusted_appointment_ids}

        ignored_appointment_ids = appointment_sync_data.get("ignored_appointment_ids")
        if ignored_appointment_ids is not None:
            ignored_ids = {str(aid) for aid in ignored_appointment_ids}

    email_for_errors = os.getenv("ERROR_EMAILS", "")

    reporter = SyncReporter()

    logger.info("Processing appointments from CSV and Google Calendar...")
    appointments_df, billing_df = prepare_appointments_from_csv(
        reporter,
        trusted_ids=trusted_ids,
        ignored_ids=ignored_ids,
    )

    if appointments_df.empty and billing_df.empty:
        logger.warning("No appointments to insert.")
        return

    logger.info(f"Inserting {len(appointments_df)} appointments into database...")
    npi_cache = get_all_evaluators_npi_map()
    valid_npis = set(npi_cache.values())
    asd_adhd_map = get_client_id_to_asd_adhd_map()
    dob_map = get_client_id_to_dob_map()
    battery_rules = get_questionnaire_rules_with_in_person()

    for _, appointment in appointments_df.iterrows():
        appointment_id = str(appointment["APPOINTMENT_ID"])
        client_id = appointment["CLIENT_ID"]
        start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
        end_time = pd.to_datetime(appointment["ENDTIME"]).to_pydatetime()
        cancelled = type(appointment["CANCELBYNAME"]) is str
        gcal_event_id = appointment.get("gcal_event_id")
        gcal_event_title = appointment.get("gcal_title")
        gcal_calendar_id = appointment.get("gcal_calendar_id")
        cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"

        is_trusted = appointment_id in trusted_ids

        evaluator_npi = None
        gcal_location = None
        gcal_daeval = None

        if gcal_calendar_id:
            evaluator_npi = npi_cache.get(gcal_calendar_id)
            if evaluator_npi is None:
                logger.error(
                    f"NPI not found for calendar ID (email): {gcal_calendar_id}"
                )
                reporter.log_missing_npi(gcal_calendar_id)
                continue

            # Ensure gcal_event_title is a string, default to empty if not
            if not isinstance(gcal_event_title, str):
                gcal_event_title = ""

            gcal_location, gcal_daeval, is_confirmed = parse_location_and_type(
                gcal_event_title
            )
            confirmed_at = datetime.now() if is_confirmed else None

        elif is_trusted or cancelled:
            # Fallback to CSV NPI (trusted imports and cancelled appointments)
            raw_npi = appointment.get("NPI")
            try:
                evaluator_npi = int(raw_npi) if pd.notna(raw_npi) else None
            except (ValueError, TypeError):
                evaluator_npi = None

            if not evaluator_npi:
                logger.warning(
                    f"Skipping {'cancelled' if cancelled else 'trusted'} appointment {appointment_id} for {client_id}: No valid NPI in CSV."
                )
                continue

            if evaluator_npi not in valid_npis:
                label = "cancelled" if cancelled else "trusted"
                appt_name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
                logger.warning(
                    f"Skipping {label} appointment {appointment_id} ({appt_name}) for client {client_id} "
                    f"on {start_time.strftime('%m/%d %I:%M %p')}: "
                    f"NPI {evaluator_npi} not found in evaluator table. "
                    f"Known NPIs: {sorted(valid_npis)}"
                )
                continue

            confirmed_at = None
        else:
            if not gcal_calendar_id:
                logger.error(f"No calendar ID found for event ID: {gcal_event_id}")
            if not gcal_event_title:
                logger.error(f"No title found for event ID: {gcal_event_id}")
            continue

        put_appointment_in_db(
            appointment_id=appointment_id,
            client_id=client_id,
            evaluator_npi=evaluator_npi,
            cpt=cpt_code,
            start_time=start_time,
            end_time=end_time,
            location=gcal_location,
            da_eval=gcal_daeval,
            asd_adhd=asd_adhd_map.get(client_id),
            cancelled=cancelled,
            gcal_event_id=gcal_event_id,
            gcal_event_title=gcal_event_title,
            confirmed_at=confirmed_at,
        )

        if not cancelled and gcal_daeval and battery_rules:
            client_dob = dob_map.get(client_id)
            if client_dob:
                appt_date = (
                    start_time.date()
                    if isinstance(start_time, datetime)
                    else start_time
                )
                age = (appt_date - client_dob).days // 365
                in_person = get_in_person_assessments_for_client(
                    age=age,
                    asd_adhd=asd_adhd_map.get(client_id),
                    da_eval=gcal_daeval,
                    rules=battery_rules,
                )
                if in_person:
                    put_in_person_assessments_in_db(
                        client_id=client_id,
                        assessment_types=in_person,
                        added_date=appt_date,
                        appointment_id=appointment_id,
                    )

        if not cancelled and (cpt_code == "90791" or gcal_daeval == "DAEVAL"):
            compute_and_store_assessment_snapshot(client_id=client_id)

    if not billing_df.empty:
        logger.info(
            f"Inserting {len(billing_df)} billing-only appointments into database..."
        )
        for _, appointment in billing_df.iterrows():
            appointment_id = str(appointment["APPOINTMENT_ID"])
            client_id = appointment["CLIENT_ID"]
            start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
            end_time = pd.to_datetime(appointment["ENDTIME"]).to_pydatetime()
            cancelled = type(appointment["CANCELBYNAME"]) is str
            cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"

            raw_npi = appointment.get("NPI")
            try:
                evaluator_npi = int(raw_npi) if pd.notna(raw_npi) else None
            except (ValueError, TypeError):
                evaluator_npi = None

            if not evaluator_npi:
                logger.warning(
                    f"Skipping billing appointment {appointment_id} for {client_id}: No valid NPI in CSV."
                )
                continue

            if evaluator_npi not in valid_npis:
                name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
                logger.warning(
                    f"Skipping billing appointment {appointment_id} ({name}) for client {client_id} "
                    f"on {start_time.strftime('%m/%d %I:%M %p')}: "
                    f"NPI {evaluator_npi} not found in evaluator table. "
                    f"Known NPIs: {sorted(valid_npis)}"
                )
                continue

            put_appointment_in_db(
                appointment_id=appointment_id,
                client_id=client_id,
                evaluator_npi=evaluator_npi,
                cpt=cpt_code,
                start_time=start_time,
                end_time=end_time,
                cancelled=cancelled,
                asd_adhd=asd_adhd_map.get(client_id),
                billing_only=True,
            )

            if not cancelled and cpt_code == "90791":
                compute_and_store_assessment_snapshot(client_id=client_id)

    reporter.send_report(email_for_errors)


def move_client_folders_for_upcoming_appointments() -> None:
    """Move each client's Drive folder into their evaluator's folder as soon as we
    learn of a qualifying future appointment.

    Only acts on clients with exactly one future non-cancelled, non-rescheduled,
    non-billing-only, non-placeholder appointment, to avoid guessing which
    evaluator's folder to move to when there's a conflict. A client's folder is
    moved once per evaluator: it's skipped once already moved for that evaluator,
    and moved again if the evaluator changes.
    """
    candidates = get_appointments_needing_folder_move()
    if not candidates:
        logger.debug("No client Drive folders need moving.")
        return

    errors: list[str] = []

    for row in candidates:
        client_id = row["client_id"]
        client_name = row["client_name"]
        client_drive_id = row["client_drive_id"]
        evaluator_npi = row["evaluator_npi"]
        evaluator_name = row["evaluator_name"]
        evaluator_drive_folder_id = row["evaluator_drive_folder_id"]

        if not client_drive_id:
            continue

        if not evaluator_drive_folder_id:
            msg = (
                f"{client_name} (ID: {client_id}): evaluator {evaluator_name} "
                f"(NPI {evaluator_npi}) has no Drive folder configured."
            )
            logger.warning(msg)
            errors.append(msg)
            continue

        try:
            moved = move_drive_folder(client_drive_id, evaluator_drive_folder_id)
            if moved:
                logger.info(
                    f"Moved Drive folder for {client_name} (ID: {client_id}) to {evaluator_name}."
                )
            else:
                logger.debug(
                    f"Drive folder for {client_name} (ID: {client_id}) already in {evaluator_name}'s folder."
                )
            set_client_drive_folder_evaluator(client_id, evaluator_npi)
        except Exception as e:
            msg = f"{client_name} (ID: {client_id}): failed to move Drive folder: {e}"
            logger.exception(msg)
            errors.append(msg)

    if errors:
        email_for_errors = os.getenv("ERROR_EMAILS", "")
        if email_for_errors:
            html = (
                "<h3>Client Drive Folder Move Errors</h3><ul>"
                + "".join(f"<li>{e}</li>" for e in errors)
                + "</ul>"
            )
            send_gmail(
                message_text="Errors were detected while moving client Drive folders.",
                subject=f"Client Folder Move Errors - {datetime.now().strftime('%Y-%m-%d')}",
                to_addr=email_for_errors,
                from_addr="tech@driftwoodeval.com",
                html=html,
            )


def parse_location_and_type(
    title: str,
) -> tuple[str | None, DAEvalType | None, bool]:
    """Extract location code and evaluation type from calendar title format [LOC-TYPE].
    Also checks for [CONFIRMED] tag.

    Examples:
        "[COL-E]" -> ("COL", "EVAL", False)
        "[NYC-DE] [CONFIRMED]" -> ("NYC", "DAEVAL", True)
        "[V]" -> ("Virtual", "DA", False)
    """
    is_confirmed = "[CONFIRMED]" in title.upper()
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
            is_confirmed,
        )

    if "[V]" in title:  # Virtual can only be DA
        return "Virtual", "DA", is_confirmed

    return None, None, is_confirmed
