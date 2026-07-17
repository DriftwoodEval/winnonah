import os
import shutil
from collections.abc import Callable
from datetime import datetime
from typing import Annotated, cast

import pandas as pd
import typer
from dotenv import load_dotenv
from loguru import logger

import utils.appointments
import utils.clients
import utils.config
import utils.database
import utils.google
import utils.location
import utils.medicaid
import utils.openphone
import utils.referrals
import utils.therapyappointment
from utils.constants import TABLE_APPOINTMENT, TABLE_EVALUATOR
from utils.fax_close import (
    generate_close_faxes,
    replace_misformatted_doctors,
    send_close_faxes,
)
from utils.fax_reports import generate_report_cover_pages, send_report_faxes
from utils.google import find_gcal_event_by_client_and_time, update_gcal_event_title
from utils.misc import json_log_format

_main_excluded_modules = {"utils.fax_close", "utils.fax_reports"}
logger.add(
    "logs/winnonah-python.log",
    format=json_log_format,
    rotation="500 MB",
    filter=lambda r: r["name"] not in _main_excluded_modules,
)
load_dotenv()


def filter_clients_by_criteria(
    clients: pd.DataFrame,
    names: list[str] | None = None,
    client_ids: list[str | int] | None = None,
    criteria_func: Callable[[pd.Series], bool] | None = None,
) -> pd.DataFrame | None:
    """Filter clients based on various criteria.

    Args:
        clients: DataFrame of all clients
        names: A list of full or partial names to match (case insensitive).
        client_ids: A list of specific client IDs to match.
        criteria_func: Custom function that takes a DataFrame row and returns bool

    Returns:
        Filtered clients DataFrame or None if no clients match
    """
    filtered_clients = clients.copy()

    name_match = pd.Series(
        [False] * len(filtered_clients), index=filtered_clients.index
    )
    id_match = pd.Series([False] * len(filtered_clients), index=filtered_clients.index)

    if names:
        for name in names:
            if not name:
                continue
            current_match = (
                filtered_clients["FIRSTNAME"].str.contains(name, case=False, na=False)
                | filtered_clients["LASTNAME"].str.contains(name, case=False, na=False)
                | (
                    filtered_clients["FIRSTNAME"].astype(str)
                    + " "
                    + filtered_clients["LASTNAME"].astype(str)
                ).str.contains(name, case=False, na=False)
            )

            if "PREFERRED_NAME" in filtered_clients.columns:
                preferred_match = filtered_clients["PREFERRED_NAME"].str.contains(
                    name, case=False, na=False
                )
                current_match = current_match | preferred_match
            name_match = name_match | current_match

    if client_ids:
        str_client_ids = [str(cid) for cid in client_ids if cid]
        if str_client_ids:
            id_match = filtered_clients["CLIENT_ID"].astype(str).isin(str_client_ids)

    if names or client_ids:
        combined_match = name_match | id_match
        filtered_clients = cast(pd.DataFrame, filtered_clients[combined_match])

    if criteria_func:
        filtered_clients = cast(
            pd.DataFrame,
            filtered_clients[filtered_clients.apply(criteria_func, axis=1)],
        )

    if filtered_clients.empty:
        return None

    if isinstance(filtered_clients, pd.Series):
        return filtered_clients.to_frame().T

    return filtered_clients


def import_from_ta(
    clients: pd.DataFrame | None = None,
    force_clients: pd.DataFrame | None = None,
    should_download=True,
):
    """Imports data from TA CSVs into the database.

    Args:
        clients: Pre-loaded clients DataFrame to avoid re-downloading
        force_clients: Specific clients to force through geocoding regardless of address change.
    """
    if clients is None:
        clients = utils.clients.get_clients(should_download)

    with utils.database.db_session() as conn:
        # Pre-emptively add empty columns
        new_cols = [
            "SCHOOL_DISTRICT",
            "LATITUDE",
            "LONGITUDE",
            "FLAG",
        ]
        for col in new_cols:
            if col not in clients.columns:
                clients[col] = pd.NA

        clients_to_geocode = utils.database.filter_clients_with_changed_address(
            clients, connection=conn
        )

        if force_clients is not None and not force_clients.empty:
            logger.info(f"Force processing {len(force_clients)} clients")

            if not clients_to_geocode.empty:
                # Remove clients that are already on the geocoding list to avoid duplicates
                clients_to_geocode = clients_to_geocode[
                    ~clients_to_geocode["CLIENT_ID"].isin(force_clients["CLIENT_ID"])
                ]

            clients_to_geocode = pd.concat(
                [clients_to_geocode, force_clients], ignore_index=True
            )

        if not clients_to_geocode.empty:
            logger.debug(f"Found {len(clients_to_geocode)} clients to geocode")

            clients_to_geocode[
                [
                    "SCHOOL_DISTRICT",
                    "LATITUDE",
                    "LONGITUDE",
                    "FLAG",
                ]
            ] = clients_to_geocode.apply(utils.location.add_location_data, axis=1)

            clients["CLIENT_ID"] = clients["CLIENT_ID"].astype(str)
            clients_to_geocode["CLIENT_ID"] = clients_to_geocode["CLIENT_ID"].astype(
                str
            )

            clients = clients.drop_duplicates(subset=["CLIENT_ID"], keep="first")
            clients_to_geocode = clients_to_geocode.drop_duplicates(
                subset=["CLIENT_ID"], keep="last"
            )

            clients = clients.set_index("CLIENT_ID")
            clients_to_geocode = clients_to_geocode.set_index("CLIENT_ID")

            clients.index = clients.index.astype(str)
            clients_to_geocode.index = clients_to_geocode.index.astype(str)

            clients.update(clients_to_geocode)

        clients = clients.reset_index()
        utils.database.put_clients_in_db(clients, connection=conn)

        raw_insurance = utils.clients.get_raw_insurance_data(should_download_csvs=False)
        utils.database.put_client_insurance_policies_in_db(
            raw_insurance, connection=conn
        )
        utils.database.sync_client_insurance_from_policies(connection=conn)
        utils.database.sync_scm_insurance_reviews(connection=conn)

        all_clients_from_db = utils.database.get_all_clients(connection=conn)

        force_clients_ids = (
            set(force_clients["CLIENT_ID"]) if force_clients is not None else None
        )

        try:
            evaluators = utils.database.get_evaluators_with_blocked_locations(
                connection=conn
            )
        except Exception as e:
            logger.error(
                f"Failed to fetch evaluators, skipping client-evaluator matching this run: {e}"
            )
        else:
            utils.database.insert_by_matching_criteria(
                all_clients_from_db,
                evaluators,
                connection=conn,
                force_client_ids=force_clients_ids,
            )

        appointment_sync_config = utils.config.load_appointment_sync_config()
        utils.appointments.insert_appointments_with_gcal(appointment_sync_config)


def process_resync_confirmed():
    """Update Google Calendar event titles for confirmed appointments missing the [CONFIRMED] tag."""
    query = f"""
        SELECT a.id, a.clientId, a.startTime, a.calendarEventId, a.calendarEventTitle,
               e.email AS evaluatorCalendarId
        FROM {TABLE_APPOINTMENT} a
        LEFT JOIN {TABLE_EVALUATOR} e ON a.evaluatorNpi = e.npi
        WHERE a.confirmedAt IS NOT NULL
          AND a.cancelled = 0
          AND a.calendarEventId IS NOT NULL
          AND (a.calendarEventTitle NOT LIKE '%[CONFIRMED]%' OR a.calendarEventTitle IS NULL)
    """
    with utils.database.db_session() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()

        logger.info(
            f"Found {len(rows)} confirmed appointment(s) missing [CONFIRMED] tag."
        )
        updated = 0
        failed = 0

        for row in rows:
            appt_id = row["id"]
            event_id = row["calendarEventId"]
            current_title = row["calendarEventTitle"] or ""
            new_title = f"{current_title} [CONFIRMED]".strip()

            evaluator_calendar_id = row.get("evaluatorCalendarId")
            success = update_gcal_event_title(
                event_id, new_title, calendar_id=evaluator_calendar_id
            )

            if not success:
                logger.warning(
                    f"Event {event_id} not found by ID for appt {appt_id}; searching by client/time..."
                )
                found = find_gcal_event_by_client_and_time(
                    row["clientId"], row["startTime"]
                )
                if found:
                    event_id = found["event_id"]
                    found_title = found["title"]
                    if "[confirmed]" in found_title.lower():
                        logger.info(
                            f"Calendar event for appt {appt_id} already has [CONFIRMED]; updating DB only."
                        )
                        new_title = found_title
                    else:
                        new_title = f"{found_title} [CONFIRMED]".strip()
                        update_gcal_event_title(
                            event_id,
                            new_title,
                            calendar_id=found["calendar_id"],
                        )
                    logger.info(
                        f"Corrected stale event ID for appt {appt_id}: "
                        f"{row['calendarEventId']!r} → {event_id!r}"
                    )
                    success = True

            if success:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"UPDATE {TABLE_APPOINTMENT} SET calendarEventId = %s, calendarEventTitle = %s WHERE id = %s",
                        (event_id, new_title, appt_id),
                    )
                conn.commit()

            if success:
                updated += 1
            else:
                logger.error(f"Could not find calendar event for appt {appt_id}.")
                failed += 1

        logger.info(f"Resync complete: {updated} updated, {failed} failed.")


def process_referrals():
    """Process referrals, creating folders for them in Google Drive."""
    logger.debug("Processing referrals")
    clients = utils.database.get_all_clients()
    if datetime.now().weekday() == 4:  # Friday
        utils.referrals.create_and_send_referral_faxes(clients)
    utils.referrals.make_referral_fax_folders(clients)
    logger.debug("Finished processing referrals")


def main(
    download_only: Annotated[
        bool, typer.Option("--download-only", help="Download TA CSVs and exit")
    ] = False,
    import_only: Annotated[
        bool, typer.Option("--import-only", help="Import data from TA CSVs and exit")
    ] = False,
    openphone: Annotated[
        bool,
        typer.Option("--openphone", help="Download TA CSVs and sync OpenPhone data"),
    ] = False,
    referrals: Annotated[
        bool,
        typer.Option("--referrals", help="Download TA CSVs and process referrals"),
    ] = False,
    drive_ids: Annotated[
        bool, typer.Option("--drive-ids", help="Add client IDs to Google Drive")
    ] = False,
    client_info_files: Annotated[
        bool,
        typer.Option(
            "--client-info-files",
            help="Sync '0 - {name} info.txt' files for clients with an appointment tomorrow",
        ),
    ] = False,
    save_ta_hashes: Annotated[
        bool, typer.Option("--save-ta-hashes", help="Save TA hashes to DB")
    ] = False,
    resync_confirmed: Annotated[
        bool,
        typer.Option(
            "--resync-confirmed",
            help="Resync [CONFIRMED] tags on calendar events for all confirmed appointments",
        ),
    ] = False,
    fax: Annotated[
        bool,
        typer.Option(
            "--fax",
            help="Run all fax operations (generate and send close faxes and report faxes)",
        ),
    ] = False,
    client: Annotated[
        list[str] | None,
        typer.Option(
            "--client",
            help="Process specific client(s) by name or ID (comma-separated or multiple flags)",
        ),
    ] = None,
    force_all: Annotated[
        bool,
        typer.Option("--force-all", help="Force all clients through geocoding process"),
    ] = False,
    medicaid: Annotated[
        bool,
        typer.Option(
            "--medicaid",
            help="Check if logged in to SC Medicaid Portal and log in if not",
        ),
    ] = False,
):
    """Main entry point for the script, parses the command line arguments and runs the appropriate functions."""
    utils.config.validate_config()

    dev_mode = os.getenv("DEV_TOGGLE")

    trigger_args = [openphone, download_only]

    if (any(trigger_args) or not dev_mode) and not import_only:
        logger.debug("Removing temp directory")
        shutil.rmtree("temp", ignore_errors=True)

    if download_only:
        logger.info("Running download only")
        utils.therapyappointment.download_csvs()
        return

    if openphone:
        logger.info("Running OpenPhone sync")
        utils.therapyappointment.download_csvs()
        utils.openphone.sync_openphone()
        return

    if referrals:
        logger.info("Running Referrals process")
        utils.therapyappointment.download_csvs()
        process_referrals()
        return

    if drive_ids:
        logger.info("Running Drive IDs process")
        utils.google.add_client_ids_to_drive()
        return

    if client_info_files:
        logger.info("Syncing client info files")
        utils.google.sync_client_info_files()
        return

    if save_ta_hashes:
        logger.info("Saving TA hashes")
        utils.therapyappointment.save_ta_hashes()
        return

    if resync_confirmed:
        logger.info("Resyncing [CONFIRMED] tags on calendar events")
        process_resync_confirmed()
        return

    if fax:
        logger.info("Running fax operations")
        replace_misformatted_doctors()
        generate_close_faxes()
        generate_report_cover_pages()
        send_close_faxes()
        send_report_faxes()
        return

    if medicaid:
        if client:
            names_filter = []
            ids_filter = []
            for entry in client:
                for part in [p.strip() for p in entry.split(",") if p.strip()]:
                    if part.isdigit():
                        ids_filter.append(part)
                    else:
                        names_filter.append(part)
            utils.medicaid.lookup_scm_eligibility(
                names=names_filter or None,
                client_ids=ids_filter or None,
            )
        else:
            utils.medicaid.lookup_new_scm_eligibility()
        return

    force_clients: pd.DataFrame | None = None
    clients: pd.DataFrame | None = None

    if client or force_all:
        clients = utils.clients.get_clients(not client and not force_all)

        if force_all:
            logger.info("Force processing ALL clients")
            force_clients = clients
        elif client:
            names_to_filter = []
            ids_to_filter = []

            for entry in client:
                # Handle comma-separated values in each entry
                parts = [p.strip() for p in entry.split(",") if p.strip()]
                for part in parts:
                    if part.isdigit():
                        ids_to_filter.append(part)
                    else:
                        names_to_filter.append(part)

            force_clients = filter_clients_by_criteria(
                clients, names=names_to_filter, client_ids=ids_to_filter
            )

            if force_clients is None or force_clients.empty:
                search_term = ", ".join(names_to_filter + ids_to_filter)
                logger.warning(f"No clients found matching '{search_term}'")
                return

            logger.info(
                f"Found {len(force_clients)} client{'' if len(force_clients) == 1 else 's'} matching criteria:"
            )
            for _, client_row in force_clients.iterrows():
                full_name = f"{client_row.get('FIRSTNAME', '')} {client_row.get('LASTNAME', '')}".strip()
                preferred_name = client_row.get("PREFERRED_NAME", "")
                name_display = f"{full_name}"
                if preferred_name and pd.notna(preferred_name):
                    name_display += f" (Preferred: {preferred_name})"
                logger.info(
                    f"  - {name_display} (ID: {client_row.get('CLIENT_ID', 'N/A')})"
                )

    import_from_ta(
        clients=clients, force_clients=force_clients, should_download=not import_only
    )
    if client or force_all or import_only:
        return

    try:
        utils.database.mark_posteval_pending_questionnaires()
    except Exception as e:
        logger.error(f"Failed to mark post-eval pending questionnaires: {e}")

    if not dev_mode:
        try:
            process_referrals()
        except Exception as e:
            logger.error(f"Failed to process referrals: {e}")

        try:
            utils.medicaid.lookup_new_scm_eligibility()
        except Exception as e:
            logger.error(f"Failed to lookup SCM eligibility: {e}")

        try:
            utils.therapyappointment.save_ta_hashes()
        except Exception as e:
            logger.error(f"Failed to save TA hashes: {e}")

        try:
            utils.google.add_client_ids_to_drive()
        except Exception as e:
            logger.error(f"Failed to add client IDs to drive: {e}")

        try:
            utils.google.sync_client_info_files()
        except Exception as e:
            logger.error(f"Failed to sync client info files: {e}")

        try:
            utils.appointments.move_client_folders_for_upcoming_appointments()
        except Exception as e:
            logger.error(f"Failed to move client Drive folders: {e}")

        try:
            replace_misformatted_doctors()
        except Exception as e:
            logger.error(f"Failed to replace misformatted doctors: {e}")

        try:
            generate_close_faxes()
        except Exception as e:
            logger.error(f"Failed to generate close faxes: {e}")

        try:
            generate_report_cover_pages()
        except Exception as e:
            logger.error(f"Failed to generate report cover pages: {e}")

        try:
            send_close_faxes()
        except Exception as e:
            logger.error(f"Failed to send close faxes: {e}")

        try:
            send_report_faxes()
        except Exception as e:
            logger.error(f"Failed to send report faxes: {e}")


if __name__ == "__main__":
    typer.run(main)
