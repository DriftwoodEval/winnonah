import html
import os
import re
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Literal

import pandas as pd
from dateutil import parser
from dateutil.relativedelta import relativedelta
from loguru import logger

from utils.constants import TEST_NAMES_LOWER
from utils.database import (
    compute_and_store_assessment_snapshot,
    get_all_evaluators_npi_map,
    get_appointments_needing_folder_move,
    get_archived_evaluator_npis,
    get_client_id_to_asd_adhd_map,
    get_client_id_to_dob_map,
    get_client_id_to_hash_map,
    get_in_person_assessments_for_client,
    get_npi_to_name_map,
    get_questionnaire_rules_with_in_person,
    get_sync_report_date,
    put_appointment_in_db,
    put_in_person_assessments_in_db,
    reconcile_pool_report_queue_state,
    reconcile_reports_from_appointments,
    set_client_drive_folder_evaluator,
    set_sync_report_date,
    sync_punchlist_to_db,
)
from utils.google import (
    build_google_service,
    clear_planned_office_events,
    google_authenticate,
    list_subfolders,
    move_drive_folder,
    rename_drive_folder,
    send_gmail,
)
from utils.task_tracker import track_task
from utils.timezone import business_to_utc, now_business, now_utc

DAEvalType = Literal["EVAL", "DA", "DAEVAL"]

_FOLDER_DATE_PREFIX_RE = re.compile(r"^\d{4}\s+")
_FOLDER_TAG_RE = re.compile(r"\s+(?:MOVE TO 00[01]|ADD DA&BIOPSYCH)$")


def build_client_folder_name(
    current_name: str,
    appointment_start_time: datetime,
    da_eval: DAEvalType | None,
    asd_adhd: str | None,
    evaluator_name: str,
    writes_own_reports: bool,
) -> str:
    """Compute a client's Drive folder name for a qualifying upcoming appointment.

    Prepends the appointment date and appends tags: MOVE TO 000 for a DA-only,
    non-ADHD appointment, or MOVE TO 001 for DAEVAL, EVAL, or an ADHD DA, but only
    when the evaluator doesn't write their own reports. Andrew's clients also get
    ADD DA&BIOPSYCH appended, regardless of that flag, except for EVAL appointments.

    Strips any date prefix and tags this function previously applied, so calling
    it again on an already-tagged name is idempotent.
    """
    base_name = _FOLDER_DATE_PREFIX_RE.sub("", current_name)
    while match := _FOLDER_TAG_RE.search(base_name):
        base_name = base_name[: match.start()]

    tags: list[str] = []
    if not writes_own_reports:
        is_adhd = asd_adhd is not None and "ADHD" in asd_adhd
        if da_eval == "DA" and not is_adhd:
            tags.append("MOVE TO 000")
        elif da_eval in ("DAEVAL", "EVAL") or (da_eval == "DA" and is_adhd):
            tags.append("MOVE TO 001")

    if "andrew" in evaluator_name.lower() and da_eval != "EVAL":
        tags.append("ADD DA&BIOPSYCH")

    date_str = appointment_start_time.strftime("%m%d")
    return " ".join([date_str, base_name, *tags])


class SyncReporter:
    """Collects synchronization errors and sends a summary email."""

    def __init__(self):
        """Initialize empty lists for different error types."""
        self.time_mismatches: list[dict[str, Any]] = []
        self.missing_in_gcal: list[dict[str, Any]] = []
        self.missing_npis: list[str] = []
        self.ambiguous_calendar_matches: list[dict[str, Any]] = []
        self.calendar_fetch_failures: list[str] = []
        self.unidentified_calendar_events: list[dict[str, Any]] = []

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

    def log_unidentified_calendar_event(
        self,
        appointment_idx: int,
        appointment_id: str,
        client_name: str,
        client_id: int,
        event_title: str,
        event_time: str,
        name_in_title: bool,
        expected_time: str,
        evaluator_name: str,
        cpt_code: str = "N/A",
    ):
        """Log an appointment with no client ID match anywhere, but where the
        expected evaluator's own calendar has an event at the right time with
        no client ID on it. Not assumed to be the same appointment, just
        surfaced as a lead for staff to check manually. Still treated as not
        found for insert purposes: nothing gets imported off this guess.

        name_in_title says whether the event's title has the client's name,
        which is some evidence it's actually this appointment rather than an
        unrelated event that happened to land at the same time.
        """
        self.unidentified_calendar_events.append(
            {
                "appointment_idx": appointment_idx,
                "appointment_id": appointment_id,
                "client_name": client_name,
                "client_id": client_id,
                "event_title": event_title,
                "event_time": event_time,
                "name_in_title": name_in_title,
                "expected_time": expected_time,
                "evaluator_name": evaluator_name,
                "cpt_code": cpt_code,
            }
        )

    def log_missing_npi(self, calendar_id: str):
        """Log a missing NPI for a calendar ID."""
        self.missing_npis.append(calendar_id)

    def log_calendar_fetch_failed(self, calendar_name: str):
        """Log a calendar whose events could not be fetched after retries.
        Any 'missing from Google Calendar' entries from the same run may
        actually be on this calendar and were never checked."""
        self.calendar_fetch_failures.append(calendar_name)

    def log_ambiguous_calendar_match(
        self,
        name: str,
        client_id: int,
        start_time: str,
        appointment_id: str,
        chosen_evaluator_name: str,
        matched_expected_evaluator: bool,
        other_evaluators: list[str],
        cpt_code: str = "N/A",
    ):
        """Log an appointment matched on more than one evaluator's calendar."""
        self.ambiguous_calendar_matches.append(
            {
                "name": name,
                "client_id": client_id,
                "start_time": start_time,
                "appointment_id": appointment_id,
                "chosen_evaluator_name": chosen_evaluator_name,
                "matched_expected_evaluator": matched_expected_evaluator,
                "other_evaluators": other_evaluators,
                "cpt_code": cpt_code,
            }
        )

    def has_errors(self) -> bool:
        """Check if any errors have been logged."""
        return any(
            [
                self.time_mismatches,
                self.missing_in_gcal,
                self.missing_npis,
                self.ambiguous_calendar_matches,
                self.calendar_fetch_failures,
                self.unidentified_calendar_events,
            ]
        )

    def to_run_summary_errors(self, hash_map: dict[int, str]) -> dict[str, dict]:
        """Converts logged errors into the run summary's `errors` shape, so
        the app can link each error to the client(s) it applies to."""
        errors: dict[str, dict] = {}

        if self.missing_npis:
            errors["Missing NPI mapping"] = {"count": len(self.missing_npis)}

        if self.calendar_fetch_failures:
            errors["Could not fetch calendar events"] = {
                "count": len(self.calendar_fetch_failures)
            }

        if self.time_mismatches:
            errors["Time mismatch (calendar vs TA)"] = {
                "count": len(self.time_mismatches),
                "clients": [
                    {"hash": client_hash, "name": item["client_name"]}
                    for item in self.time_mismatches
                    if (client_hash := hash_map.get(item["client_id"]))
                ],
            }

        if self.missing_in_gcal:
            errors["Missing from Google Calendar"] = {
                "count": len(self.missing_in_gcal),
                "clients": [
                    {"hash": client_hash, "name": item["name"]}
                    for item in self.missing_in_gcal
                    if (client_hash := hash_map.get(item["client_id"]))
                ],
            }

        if self.ambiguous_calendar_matches:
            errors["Matched on more than one evaluator's calendar"] = {
                "count": len(self.ambiguous_calendar_matches),
                "clients": [
                    {"hash": client_hash, "name": item["name"]}
                    for item in self.ambiguous_calendar_matches
                    if (client_hash := hash_map.get(item["client_id"]))
                ],
            }

        if self.unidentified_calendar_events:
            errors["Calendar event found without a client ID"] = {
                "count": len(self.unidentified_calendar_events),
                "clients": [
                    {"hash": client_hash, "name": item["client_name"]}
                    for item in self.unidentified_calendar_events
                    if (client_hash := hash_map.get(item["client_id"]))
                ],
            }

        return errors

    def send_report(self, recipient_email: str):
        """Send a summary email of all logged errors."""
        if not self.has_errors():
            logger.debug("No errors to report. Skipping email.")
            return

        if get_sync_report_date() == now_business().date():
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

        if self.calendar_fetch_failures:
            html_content += "<h3>Calendars That Could Not Be Searched</h3>"
            html_content += (
                "<p>These calendars' events could not be fetched after retries, so "
                "any appointments listed below as missing from Google Calendar may "
                "actually be on one of these:</p>"
            )
            html_content += (
                "<ul>"
                + "".join([f"<li>{name}</li>" for name in self.calendar_fetch_failures])
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

        if self.ambiguous_calendar_matches:
            html_content += "<h3>Matched on More Than One Evaluator's Calendar</h3>"
            html_content += (
                "<p>TA has a matching event (same client ID, within 1hr) on more than "
                "one evaluator's calendar. The appointment was imported under the "
                "evaluator TA's NPI expects when that calendar had a match, otherwise "
                "under the first calendar found:</p><ul>"
            )
            for item in self.ambiguous_calendar_matches:
                expected_note = (
                    "matched TA's expected evaluator"
                    if item["matched_expected_evaluator"]
                    else "TA's expected evaluator had no matching event"
                )
                html_content += (
                    f"<li><b>{item['name']}</b> (ID: {item['client_id']}) @ {item['start_time']}: "
                    f"imported under <b>{item['chosen_evaluator_name']}</b> ({expected_note}), "
                    f"also found on {', '.join(item['other_evaluators'])}'s calendar"
                    f"<br>&nbsp;&nbsp;<i>Appt ID: {item.get('appointment_id', 'N/A')} | CPT: {item.get('cpt_code', 'N/A')}</i></li>"
                )
            html_content += "</ul>"

        if self.unidentified_calendar_events:
            html_content += "<h3>Calendar Event Found Without a Client ID</h3>"
            html_content += (
                "<p>No event anywhere has this client's ID, but the expected "
                "evaluator's calendar has an event at the right time with no "
                "ID on it.</p><ul>"
            )
            for item in self.unidentified_calendar_events:
                name_note = (
                    "event title has the client's name"
                    if item["name_in_title"]
                    else "event title does NOT have the client's name, may be unrelated"
                )
                html_content += (
                    f"<li><b>{item['client_name']}</b> (ID: {item['client_id']}): "
                    f"TA has {item['expected_time']}, found event '{html.escape(item['event_title'])}' "
                    f"at {item['event_time']} on <b>{item['evaluator_name']}</b>'s calendar ({name_note}) "
                    f"<br>&nbsp;&nbsp;<i>Appt ID: {item.get('appointment_id', 'N/A')} | CPT: {item.get('cpt_code', 'N/A')}</i></li>"
                )
            html_content += "</ul>"

        html_content += "<p>This email was generated and sent automatically.</p>"

        send_gmail(
            message_text=text_summary,
            subject=f"Appointment Sync Errors - {now_business().strftime('%Y-%m-%d')}",
            to_addr=recipient_email,
            from_addr="tech@driftwoodeval.com",
            html=html_content,
        )
        set_sync_report_date(now_business().date())


_EVENT_PAGE_MAX_RETRIES = 3


def _fetch_events_page(
    service,
    calendar_id: str,
    search_start: str,
    search_end: str,
    page_token: str | None,
) -> dict:
    """Fetch one page of calendar events, retrying transient failures (e.g. the
    bounded request timeout in build_google_service) so a single bad page
    doesn't discard events already fetched from earlier pages of this calendar."""
    for attempt in range(1, _EVENT_PAGE_MAX_RETRIES + 1):
        try:
            return (
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
        except Exception:
            if attempt == _EVENT_PAGE_MAX_RETRIES:
                raise
            logger.warning(
                f"Retrying events page for calendar {calendar_id} "
                f"(attempt {attempt}/{_EVENT_PAGE_MAX_RETRIES})"
            )
            time.sleep(attempt)
    raise RuntimeError("unreachable")


def _parse_csv_npi(raw_npi: Any) -> int | None:
    """Parse the CSV's NPI value, which pandas may read as a float (e.g. 1.0)
    when the column has any blank values. Returns None if missing/invalid."""
    try:
        return int(raw_npi) if pd.notna(raw_npi) else None
    except (ValueError, TypeError):
        return None


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
    npi_to_email: dict[int, str],
    calendar_names: dict[str, str],
) -> dict[int, dict]:
    """Search Google Calendar events in batches by date.

    An appointment can have a matching event (same client ID, within 1hr) on more
    than one evaluator's calendar. When that happens, the calendar matching the
    evaluator NPI TA has on file for the appointment wins; if none of the matches
    is on that calendar, the first one found is used instead. Either way, the
    ambiguity is logged via the reporter so it surfaces in the sync error email.

    Returns dict mapping appointment index to event details (id, title, calendar_id).
    """
    candidates_by_idx: dict[int, list[dict]] = defaultdict(list)
    near_miss_by_idx: dict[int, list[dict]] = defaultdict(list)
    unidentified_by_idx: dict[int, list[dict]] = defaultdict(list)

    if appointments_df.empty:
        return {}

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
        fetch_failed = False

        while True:
            try:
                events_result = _fetch_events_page(
                    service, calendar_id, search_start, search_end, page_token
                )
            except Exception:
                logger.exception(
                    f"Giving up fetching events for calendar "
                    f"{calendar.get('summary', 'Unknown')} after "
                    f"{_EVENT_PAGE_MAX_RETRIES} attempts; appointments on this "
                    "calendar may be falsely reported missing"
                )
                fetch_failed = True
                break

            events = events_result.get("items", [])
            all_events.extend(events)

            page_token = events_result.get("nextPageToken")
            if not page_token:
                break

        if fetch_failed:
            reporter.log_calendar_fetch_failed(calendar.get("summary", calendar_id))

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
                client_id = appointment["CLIENT_ID"]
                client_name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
                start_time = pd.to_datetime(appointment["STARTTIME"]).to_pydatetime()
                if start_time.tzinfo is not None:
                    start_time = start_time.replace(tzinfo=None)

                expected_npi = _parse_csv_npi(appointment.get("NPI"))
                expected_email = (
                    npi_to_email.get(expected_npi) if expected_npi else None
                )

                # Iterate only the events for this specific day
                for event_dt, event in day_events:
                    description = event.get("description", "")

                    # Check Client ID
                    if str(client_id) not in description:
                        # No ID anywhere on this event, but if it's at the right
                        # time on the expected evaluator's own calendar, flag it
                        # as a lead rather than silently skipping it. Evaluators'
                        # generic "<name> Available" blocks aren't appointments
                        # at all, so they're excluded rather than flagged.
                        title = event.get("summary", "No title")
                        if (
                            calendar_id == expected_email
                            and not title.strip().lower().endswith("available")
                        ):
                            time_diff = abs((event_dt - start_time).total_seconds())
                            if time_diff <= 3600:
                                unidentified_by_idx[idx].append(
                                    {
                                        "title": title,
                                        "event_dt": event_dt,
                                        "time_diff": time_diff,
                                        "name_in_title": bool(client_name)
                                        and client_name.lower() in title.lower(),
                                    }
                                )
                        continue

                    # Check Time Difference
                    time_diff = abs((event_dt - start_time).total_seconds())

                    if time_diff <= 3600:  # 1 hour tolerance
                        candidates_by_idx[idx].append(
                            {
                                "event_id": event["id"],
                                "title": event.get("summary", "No title"),
                                "calendar_id": calendar_id,
                                "event_dt": event_dt,
                            }
                        )
                    else:
                        # Log specific mismatch, but only act on it during
                        # resolution if no calendar had an in-tolerance match.
                        logger.warning(
                            f"Found event with Client ID {client_id} but wrong time: "
                            f"Event: {event_dt}, Expected: {start_time}, Diff: {int(time_diff)}s"
                        )
                        near_miss_by_idx[idx].append(
                            {
                                "event_dt": event_dt,
                                "time_diff": time_diff,
                            }
                        )
                    break

    results: dict[int, dict] = {}

    for idx, appointment in appointments_df.iterrows():
        expected_npi = _parse_csv_npi(appointment.get("NPI"))
        expected_email = npi_to_email.get(expected_npi) if expected_npi else None

        candidates = candidates_by_idx.get(idx)

        if not candidates:
            near_misses = near_miss_by_idx.get(idx)
            if near_misses:
                closest = min(near_misses, key=lambda m: m["time_diff"])
                cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
                reporter.log_time_mismatch(
                    appointment_idx=idx,
                    appointment_id=str(appointment["APPOINTMENT_ID"]),
                    client_name=re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip(),
                    client_id=appointment["CLIENT_ID"],
                    found_time=closest["event_dt"].strftime("%m/%d/%Y %-I:%M %p"),
                    expected_time=pd.to_datetime(appointment["STARTTIME"])
                    .to_pydatetime()
                    .strftime("%m/%d/%Y %-I:%M %p"),
                    cpt_code=cpt_code,
                )
            else:
                unidentified = unidentified_by_idx.get(idx)
                if unidentified:
                    # Prefer a candidate whose title has the client's name, even
                    # if it's not the closest in time, over one that doesn't.
                    closest = min(
                        unidentified,
                        key=lambda m: (not m["name_in_title"], m["time_diff"]),
                    )
                    cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
                    reporter.log_unidentified_calendar_event(
                        appointment_idx=idx,
                        appointment_id=str(appointment["APPOINTMENT_ID"]),
                        client_name=re.sub(
                            r"[\d\(\)]", "", appointment["NAME"]
                        ).strip(),
                        client_id=appointment["CLIENT_ID"],
                        event_title=closest["title"],
                        event_time=closest["event_dt"].strftime("%m/%d/%Y %-I:%M %p"),
                        name_in_title=closest["name_in_title"],
                        expected_time=pd.to_datetime(appointment["STARTTIME"])
                        .to_pydatetime()
                        .strftime("%m/%d/%Y %-I:%M %p"),
                        evaluator_name=calendar_names.get(
                            expected_email, expected_email
                        )
                        if expected_email
                        else "Unknown",
                        cpt_code=cpt_code,
                    )
            continue

        expected_candidates = [
            c for c in candidates if c["calendar_id"] == expected_email
        ]
        chosen = expected_candidates[0] if expected_candidates else candidates[0]

        results[idx] = {
            "event_id": chosen["event_id"],
            "title": chosen["title"],
            "calendar_id": chosen["calendar_id"],
        }

        other_calendar_ids = {
            c["calendar_id"]
            for c in candidates
            if c["calendar_id"] != chosen["calendar_id"]
        }
        if other_calendar_ids:
            reporter.log_ambiguous_calendar_match(
                name=re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip(),
                client_id=appointment["CLIENT_ID"],
                start_time=pd.to_datetime(appointment["STARTTIME"])
                .to_pydatetime()
                .strftime("%m/%d/%Y %-I:%M %p"),
                appointment_id=str(appointment["APPOINTMENT_ID"]),
                chosen_evaluator_name=calendar_names.get(
                    chosen["calendar_id"], chosen["calendar_id"]
                ),
                matched_expected_evaluator=bool(expected_candidates),
                other_evaluators=sorted(
                    calendar_names.get(cal_id, cal_id) for cal_id in other_calendar_ids
                ),
                cpt_code=re.sub(r"\D", "", appointment["NAME"]) or "N/A",
            )

    return results


def prepare_appointments_from_csv(
    reporter: SyncReporter,
    trusted_ids: set[str],
    ignored_ids: set[str],
    npi_cache: dict[str, int],
    archived_npis: set[int],
):
    """Load CSV, filter invalid rows, and merge with Google Calendar data."""

    creds = google_authenticate()
    service = build_google_service("calendar", "v3", creds)

    appointments_df = pd.read_csv("temp/input/clients-appointments.csv")
    appointments_df["NAME"] = appointments_df["NAME"].fillna("N/A").astype(str)

    appointments_df["STARTTIME_DT"] = pd.to_datetime(appointments_df["STARTTIME"])
    appointments_df["ENDTIME_DT"] = pd.to_datetime(
        appointments_df["ENDTIME"], errors="coerce"
    )

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
    npi_to_email = {npi: email for email, npi in npi_cache.items()}
    calendar_names = {
        email: npi_map.get(npi, email) for email, npi in npi_cache.items()
    }

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
    flagged_skip_appointment = 0
    flagged_90000_duplicate = 0
    flagged_next_day_billing = 0
    flagged_short_duration = 0

    for idx, appointment in appointments_df.iterrows():
        appointment_id = str(appointment["APPOINTMENT_ID"])
        client_id = appointment["CLIENT_ID"]
        start_time = appointment["STARTTIME_DT"]
        cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"

        if appointment_id in ignored_ids:
            indices_to_drop.add(idx)
            continue

        # Appointments before this date predate Google Calendar usage and will never
        # have a matching GCal event. Silently skip rather than require manual ignore list entries.
        if start_time.date() < date(2025, 7, 1):
            indices_to_drop.add(idx)
            continue

        if should_skip_appointment(appointment):
            flagged_skip_appointment += 1
            billing_indices.add(idx)
            continue

        # Appointments shorter than 30 minutes are insurance billing entries, not
        # real sessions. Skip rows with an unparseable ENDTIME rather than guess.
        end_time = appointment["ENDTIME_DT"]
        if pd.notna(end_time) and (end_time - start_time) < timedelta(minutes=30):
            flagged_short_duration += 1
            billing_indices.add(idx)
            continue

        # Flag 90000 CPT duplicates within 6 months as billing-only.
        # Only non-cancelled appointments count as the reference "real" appointment.
        cancelled = isinstance(appointment["CANCELBYNAME"], str)
        if "90000" in cpt_code:
            last_date = last_90000_appointment_date.get(client_id)
            if last_date and (start_time - last_date).days < 182:
                flagged_90000_duplicate += 1
                billing_indices.add(idx)
                continue
            if not cancelled:
                last_90000_appointment_date[client_id] = start_time

        # Detect next-day billing-only appointments (insurance billing entries in TA)
        previous_app_date = start_time.date() - timedelta(days=1)

        if (client_id, previous_app_date) in client_date_set:
            flagged_next_day_billing += 1
            billing_indices.add(idx)
            continue

    if indices_to_drop:
        logger.debug(f"Skipped {len(indices_to_drop)} ignored appointment(s).")
    if flagged_skip_appointment:
        logger.debug(
            f"Flagged {flagged_skip_appointment} appointment(s) as billing-only "
            "(skipped CPT)."
        )
    if flagged_90000_duplicate:
        logger.debug(
            f"Flagged {flagged_90000_duplicate} appointment(s) as billing-only "
            "(90000 CPT within 6 months of a prior one)."
        )
    if flagged_next_day_billing:
        logger.debug(
            f"Flagged {flagged_next_day_billing} appointment(s) as billing-only "
            "(seen on previous day)."
        )
    if flagged_short_duration:
        logger.debug(
            f"Flagged {flagged_short_duration} appointment(s) as billing-only "
            "(shorter than 30 minutes)."
        )
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

    # Archived evaluators have no live Google Calendar to match against (their
    # calendar is transferred to an empty placeholder on offboarding), so trust
    # the TherapyAppointment import directly instead of reporting them missing.
    archived_mask = appointments_df["NPI"].apply(
        lambda n: _parse_csv_npi(n) in archived_npis
    )
    archived_df = appointments_df[archived_mask].copy()
    appointments_df = appointments_df[~archived_mask].copy().reset_index(drop=True)

    logger.info(f"Searching Google Calendar for {len(appointments_df)} appointments...")

    calendars = []
    page_token = None
    while True:
        calendar_list = service.calendarList().list(pageToken=page_token).execute()
        calendars.extend(calendar_list.get("items", []))
        page_token = calendar_list.get("nextPageToken")
        if not page_token:
            break

    search_results = batch_search_calendar_events(
        service, calendars, appointments_df, reporter, npi_to_email, calendar_names
    )

    mismatched_indices = {item["appointment_idx"] for item in reporter.time_mismatches}
    unidentified_indices = {
        item["appointment_idx"] for item in reporter.unidentified_calendar_events
    }
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
        elif idx in unidentified_indices:
            # Only a lead (same time, no ID match), never treated as a match:
            # this appointment is dropped (or trusted off the CSV NPI) exactly
            # like a plain "not found" appointment would be.
            if is_trusted:
                logger.warning(
                    f"Trusting import for appointment {appointment_id} despite "
                    "unidentified calendar event."
                )
            else:
                # We already logged this via log_unidentified_calendar_event
                final_drops.add(idx)
        else:
            name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
            start_time = appointment["STARTTIME_DT"]

            raw_npi = appointment.get("NPI")
            npi_int = _parse_csv_npi(raw_npi)
            evaluator_name = npi_map.get(npi_int, f"Unknown NPI ({raw_npi})")

            logger.error(
                f"Not found in any calendar: {name} ({appointment['CLIENT_ID']}) "
                f"at {start_time.strftime('%m/%d/%Y %-I:%M %p')} "
                f"[Expected Evaluator: {evaluator_name}]"
            )

            cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"
            reporter.log_missing_in_gcal(
                name=name,
                client_id=appointment["CLIENT_ID"],
                start_time=start_time.strftime("%m/%d/%Y %-I:%M %p"),
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
    return (
        pd.concat([result_df, archived_df, cancelled_df], ignore_index=True),
        billing_df,
    )


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
    npi_cache = get_all_evaluators_npi_map()
    archived_npis = get_archived_evaluator_npis()

    logger.info("Processing appointments from CSV and Google Calendar...")
    appointments_df, billing_df = prepare_appointments_from_csv(
        reporter,
        trusted_ids=trusted_ids,
        ignored_ids=ignored_ids,
        npi_cache=npi_cache,
        archived_npis=archived_npis,
    )

    if appointments_df.empty and billing_df.empty:
        logger.warning("No appointments to insert.")
        return

    with track_task("appointment_sync", "Syncing appointments") as task:
        if task is None:
            logger.info(
                "Skipping run: a previous appointment sync run is still in progress."
            )
            return

        logger.info(f"Inserting {len(appointments_df)} appointments into database...")
        valid_npis = set(npi_cache.values())
        asd_adhd_map = get_client_id_to_asd_adhd_map()
        dob_map = get_client_id_to_dob_map()
        hash_map = get_client_id_to_hash_map()
        battery_rules = get_questionnaire_rules_with_in_person()
        skipped_locked_in_snapshots = 0
        in_person_assessments_added = 0
        appointments_synced = 0
        real_synced = 0
        billing_only_synced = 0
        cancelled_synced = 0
        moved_synced = 0
        clients_with_in_person_assessments: set[int] = set()
        cleared_office_events: set[tuple[str, date]] = set()
        # "Planned: <office>" placeholders are only ever set for the near term, so
        # there's no point clearing them for appointments well outside that window.
        office_events_window_start = now_business().date() - relativedelta(months=1)
        office_events_window_end = now_business().date() + relativedelta(months=3)

        total_appointments = len(appointments_df)
        for i, (_, appointment) in enumerate(appointments_df.iterrows(), start=1):
            task.progress(i, total_appointments)
            appointment_id = str(appointment["APPOINTMENT_ID"])
            client_id = appointment["CLIENT_ID"]
            # TherapyAppointment exports naive business-local wall-clock time.
            start_time_business = pd.to_datetime(
                appointment["STARTTIME"]
            ).to_pydatetime()
            end_time_business = pd.to_datetime(appointment["ENDTIME"]).to_pydatetime()
            start_time = business_to_utc(start_time_business)
            end_time = business_to_utc(end_time_business)
            cancelled = type(appointment["CANCELBYNAME"]) is str
            gcal_event_id = appointment.get("gcal_event_id")
            gcal_event_title = appointment.get("gcal_title")
            gcal_calendar_id = appointment.get("gcal_calendar_id")
            cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"

            is_trusted = appointment_id in trusted_ids
            csv_npi = _parse_csv_npi(appointment.get("NPI"))
            archived_evaluator = csv_npi in archived_npis

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
                confirmed_at = now_utc() if is_confirmed else None

            elif is_trusted or cancelled or archived_evaluator:
                # Fallback to CSV NPI (trusted imports, cancelled appointments, and
                # appointments for archived evaluators, who have no live calendar)
                evaluator_npi = csv_npi

                if not evaluator_npi:
                    label = "cancelled" if cancelled else "trusted"
                    logger.warning(
                        f"Skipping {label} appointment {appointment_id} for {client_id}: No valid NPI in CSV."
                    )
                    continue

                if evaluator_npi not in valid_npis:
                    label = (
                        "cancelled"
                        if cancelled
                        else "archived evaluator"
                        if archived_evaluator
                        else "trusted"
                    )
                    appt_name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
                    logger.warning(
                        f"Skipping {label} appointment {appointment_id} ({appt_name}) for client {client_id} "
                        f"on {start_time_business.strftime('%m/%d %I:%M %p')}: "
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

            rescheduled = put_appointment_in_db(
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
            appointments_synced += 1
            real_synced += 1
            if cancelled:
                cancelled_synced += 1
            if rescheduled:
                moved_synced += 1

            if not cancelled and gcal_calendar_id:
                appt_day = (
                    start_time.date()
                    if isinstance(start_time, datetime)
                    else start_time
                )
                office_event_key = (gcal_calendar_id, appt_day)
                in_office_events_window = (
                    office_events_window_start <= appt_day <= office_events_window_end
                )
                if (
                    in_office_events_window
                    and office_event_key not in cleared_office_events
                ):
                    try:
                        clear_planned_office_events(gcal_calendar_id, appt_day)
                    except Exception as e:
                        logger.warning(
                            f"Could not clear planned-office events for {gcal_calendar_id} on {appt_day}: {e}"
                        )
                    cleared_office_events.add(office_event_key)

            if not cancelled and gcal_daeval and battery_rules:
                client_dob = dob_map.get(client_id)
                if client_dob:
                    appt_date = (
                        start_time_business.date()
                        if isinstance(start_time_business, datetime)
                        else start_time_business
                    )
                    age = (appt_date - client_dob).days // 365
                    in_person = get_in_person_assessments_for_client(
                        age=age,
                        asd_adhd=asd_adhd_map.get(client_id),
                        da_eval=gcal_daeval,
                        rules=battery_rules,
                    )
                    if in_person:
                        added = put_in_person_assessments_in_db(
                            client_id=client_id,
                            assessment_types=in_person,
                            added_date=appt_date,
                            appointment_id=appointment_id,
                        )
                        if added:
                            in_person_assessments_added += added
                            clients_with_in_person_assessments.add(client_id)

            if (
                not cancelled
                and (cpt_code == "90791" or gcal_daeval == "DAEVAL")
                and compute_and_store_assessment_snapshot(client_id=client_id)
            ):
                skipped_locked_in_snapshots += 1

        if not billing_df.empty:
            logger.info(
                f"Inserting {len(billing_df)} billing-only appointments into database..."
            )
            total_billing = len(billing_df)
            for i, (_, appointment) in enumerate(billing_df.iterrows(), start=1):
                task.progress(i, total_billing)
                appointment_id = str(appointment["APPOINTMENT_ID"])
                client_id = appointment["CLIENT_ID"]
                # TherapyAppointment exports naive business-local wall-clock time.
                start_time_business = pd.to_datetime(
                    appointment["STARTTIME"]
                ).to_pydatetime()
                end_time_business = pd.to_datetime(
                    appointment["ENDTIME"]
                ).to_pydatetime()
                start_time = business_to_utc(start_time_business)
                end_time = business_to_utc(end_time_business)
                cancelled = type(appointment["CANCELBYNAME"]) is str
                cpt_code = re.sub(r"\D", "", appointment["NAME"]) or "N/A"

                evaluator_npi = _parse_csv_npi(appointment.get("NPI"))

                if not evaluator_npi:
                    logger.warning(
                        f"Skipping billing appointment {appointment_id} for {client_id}: No valid NPI in CSV."
                    )
                    continue

                if evaluator_npi not in valid_npis:
                    name = re.sub(r"[\d\(\)]", "", appointment["NAME"]).strip()
                    logger.warning(
                        f"Skipping billing appointment {appointment_id} ({name}) for client {client_id} "
                        f"on {start_time_business.strftime('%m/%d %I:%M %p')}: "
                        f"NPI {evaluator_npi} not found in evaluator table. "
                        f"Known NPIs: {sorted(valid_npis)}"
                    )
                    continue

                rescheduled = put_appointment_in_db(
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
                appointments_synced += 1
                billing_only_synced += 1
                if cancelled:
                    cancelled_synced += 1
                if rescheduled:
                    moved_synced += 1

                if (
                    not cancelled
                    and cpt_code == "90791"
                    and compute_and_store_assessment_snapshot(client_id=client_id)
                ):
                    skipped_locked_in_snapshots += 1

        if in_person_assessments_added:
            logger.info(
                f"Added {in_person_assessments_added} in-person assessment(s) for "
                f"{len(clients_with_in_person_assessments)} client(s)"
            )

        if skipped_locked_in_snapshots:
            logger.debug(
                f"Skipped {skipped_locked_in_snapshots} assessment snapshot(s): already locked in"
            )

        try:
            reconcile_reports_from_appointments()
        except Exception:
            logger.exception("Failed to reconcile report rows from appointments")

        try:
            reconcile_pool_report_queue_state()
        except Exception:
            logger.exception("Failed to reconcile pool report queue state")

        try:
            sync_punchlist_to_db()
        except Exception:
            logger.exception("Failed to sync the punch list to the DB")

        reporter.send_report(email_for_errors)
        task.set_summary(
            {
                "appointments_synced": appointments_synced,
                "real_synced": real_synced,
                "billing_only_synced": billing_only_synced,
                "cancelled_synced": cancelled_synced,
                "moved_synced": moved_synced,
                "errors": reporter.to_run_summary_errors(hash_map),
            }
        )


_LETTER_RANGE_SUBFOLDER_RE = re.compile(r"^([A-Za-z])\s*-\s*([A-Za-z])$")


def _find_letter_range_subfolder(
    subfolders: dict[str, str], first_letter: str
) -> str | None:
    """Find the subfolder (e.g. "A - H") whose letter range contains first_letter.

    Reads the range from whatever subfolders actually exist rather than assuming
    a fixed set, since different evaluators may split the alphabet differently.
    """
    for name, folder_id in subfolders.items():
        match = _LETTER_RANGE_SUBFOLDER_RE.match(name.strip())
        if not match:
            continue
        start, end = match.group(1).upper(), match.group(2).upper()
        if start <= first_letter <= end:
            return folder_id
    return None


def move_client_folders_for_upcoming_appointments() -> None:
    """Move each client's Drive folder into their evaluator's folder as soon as we
    learn of a qualifying future appointment.

    Only acts on clients with exactly one future non-cancelled, non-rescheduled,
    non-billing-only, non-placeholder appointment, to avoid guessing which
    evaluator's folder to move to when there's a conflict. If the evaluator has a
    separate eval Drive folder configured, EVAL appointments move there instead of
    the evaluator's regular folder, into whichever of the eval folder's
    letter-range subfolders (e.g. "A - H") covers the client's first name. A
    client's folder is moved once per evaluator/folder pair: it's skipped once
    already moved there, and moved again if the evaluator changes or the
    appointment type crosses the eval/non-eval boundary.
    """
    candidates = get_appointments_needing_folder_move()
    if not candidates:
        logger.debug("No client Drive folders need moving.")
        return

    with track_task("move_client_folders", "Moving client Drive folders") as task:
        if task is None:
            logger.info(
                "Skipping run: a previous move client folders run is still in progress."
            )
            return

        errors: list[str] = []
        eval_subfolders_cache: dict[str, dict[str, str]] = {}
        total_candidates = len(candidates)

        for i, row in enumerate(candidates, start=1):
            task.progress(i, total_candidates)
            client_id = row["client_id"]
            client_name = row["client_name"]
            client_drive_id = row["client_drive_id"]
            evaluator_npi = row["evaluator_npi"]
            evaluator_name = row["evaluator_name"]
            is_eval_target = bool(row["target_is_eval"])
            destination_drive_folder_id = (
                row["evaluator_eval_drive_folder_id"]
                if is_eval_target
                else row["evaluator_drive_folder_id"]
            )

            if is_eval_target and destination_drive_folder_id:
                client_first_name = row["client_first_name"]
                first_letter = (
                    client_first_name.strip()[:1].upper() if client_first_name else ""
                )
                if first_letter.isalpha():
                    subfolders = eval_subfolders_cache.get(destination_drive_folder_id)
                    if subfolders is None:
                        subfolders = {
                            f["name"]: f["id"]
                            for f in list_subfolders(destination_drive_folder_id)
                        }
                        eval_subfolders_cache[destination_drive_folder_id] = subfolders
                    bucket_folder_id = _find_letter_range_subfolder(
                        subfolders, first_letter
                    )
                    if bucket_folder_id:
                        destination_drive_folder_id = bucket_folder_id
                    else:
                        msg = (
                            f"{client_name} (ID: {client_id}): evaluator {evaluator_name}'s "
                            f"eval Drive folder has no subfolder covering '{first_letter}'."
                        )
                        logger.warning(msg)
                        errors.append(msg)
                        continue

            if client_drive_id == "N/A":
                msg = f"{client_name} (ID: {client_id}): Drive folder is marked N/A."
                logger.warning(msg)
                errors.append(msg)
                continue

            if not client_drive_id:
                msg = (
                    f"{client_name} (ID: {client_id}): has no Drive folder configured."
                )
                logger.warning(msg)
                errors.append(msg)
                continue

            if not destination_drive_folder_id:
                msg = (
                    f"{client_name} (ID: {client_id}): evaluator {evaluator_name} "
                    f"(NPI {evaluator_npi}) has no{' eval' if is_eval_target else ''} "
                    "Drive folder configured."
                )
                logger.warning(msg)
                errors.append(msg)
                continue

            try:
                moved, current_name = move_drive_folder(
                    client_drive_id, destination_drive_folder_id
                )
                if moved:
                    logger.info(
                        f"Moved Drive folder for {client_name} (ID: {client_id}) to {evaluator_name}."
                    )
                else:
                    logger.debug(
                        f"Drive folder for {client_name} (ID: {client_id}) already in {evaluator_name}'s folder."
                    )

                new_name = build_client_folder_name(
                    current_name,
                    row["appointment_start_time"],
                    row["da_eval"],
                    row["asd_adhd"],
                    evaluator_name,
                    row["writes_own_reports"],
                )
                if new_name != current_name:
                    rename_drive_folder(client_drive_id, new_name)

                set_client_drive_folder_evaluator(
                    client_id, evaluator_npi, is_eval_target
                )
            except Exception as e:
                msg = (
                    f"{client_name} (ID: {client_id}): failed to move Drive folder: {e}"
                )
                logger.exception(msg)
                errors.append(msg)

        if errors:
            email_for_errors = os.getenv("ERROR_EMAILS", "")
            if email_for_errors:
                html = (
                    "<h3>Client Drive Folder Move Errors</h3><ul>"
                    + "".join(f"<li>{html.escape(e)}</li>" for e in errors)
                    + "</ul>"
                )
                send_gmail(
                    message_text="Errors were detected while moving client Drive folders.",
                    subject=f"Client Folder Move Errors - {now_business().strftime('%Y-%m-%d')}",
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


def build_placeholder_title(
    client_name: str, da_eval: DAEvalType, location_key: str
) -> str:
    """Build a placeholder calendar event title in the standard [LOC-TYPE] format.

    Examples:
        ("Jane Doe", "DAEVAL", "COL") -> "plchldr Jane Doe DAEVAL [COL-DE]"
        ("Jane Doe", "DA", "Virtual") -> "plchldr Jane Doe DA [V]"
    """
    type_letter_map: dict[DAEvalType, str] = {
        "EVAL": "E",
        "DA": "D",
        "DAEVAL": "DE",
    }

    if location_key == "Virtual":
        tag = "[V]"
    else:
        tag = f"[{location_key}-{type_letter_map[da_eval]}]"

    return f"plchldr {client_name} {da_eval} {tag}"


def build_placeholder_description(client_id: int, dob: date) -> str:
    """Build the calendar event description for a placeholder appointment."""
    today = now_business().date()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return f"Age: {age}\nClient ID: {client_id}"
