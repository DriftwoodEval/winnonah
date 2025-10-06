import argparse
import os
import re
import shutil
from typing import Callable, Optional, Union

import pandas as pd
from dotenv import load_dotenv
from loguru import logger

import utils.clients
import utils.config
import utils.database
import utils.download_ta
import utils.google
import utils.location
import utils.openphone
import utils.spreadsheets

logger.add("logs/winnonah-python.log", rotation="500 MB")
load_dotenv()


def filter_clients_by_criteria(
    clients: pd.DataFrame,
    name: Optional[str] = None,
    client_id: Optional[Union[str, int]] = None,
    criteria_func: Optional[Callable[[pd.Series], bool]] = None,
) -> pd.DataFrame | None:
    """Filter clients based on various criteria.

    Args:
        clients: DataFrame of all clients
        name: Full or partial name to match (case insensitive)
        client_id: Specific client ID to match
        criteria_func: Custom function that takes a DataFrame row and returns bool

    Returns:
        Filtered clients DataFrame or None if no clients match
    """
    filtered_clients = clients.copy()

    if name:
        name_match = (
            filtered_clients["FIRSTNAME"].str.contains(name, case=False, na=False)
            | filtered_clients["LASTNAME"].str.contains(name, case=False, na=False)
            | (
                filtered_clients["FIRSTNAME"] + " " + filtered_clients["LASTNAME"]
            ).str.contains(name, case=False, na=False)
        )

        if "PREFERRED_NAME" in filtered_clients.columns:
            preferred_match = filtered_clients["PREFERRED_NAME"].str.contains(
                name, case=False, na=False
            )
            name_match = name_match | preferred_match

        filtered_clients = filtered_clients[name_match]

    if client_id is not None:
        filtered_clients = filtered_clients[
            filtered_clients["CLIENT_ID"].astype(str) == str(client_id)
        ]

    if criteria_func:
        filtered_clients = filtered_clients[
            filtered_clients.apply(criteria_func, axis=1)
        ]

    if filtered_clients.empty:
        return None

    if isinstance(filtered_clients, pd.Series):
        return filtered_clients.to_frame().T

    return filtered_clients


def import_from_ta(
    clients: Optional[pd.DataFrame] = None, force_clients: Optional[pd.DataFrame] = None
):
    """Imports data from TA CSVs into the database.

    Args:
        clients: Pre-loaded clients DataFrame to avoid re-downloading
        force_clients: Specific clients to force through geocoding regardless of address change.
    """
    if clients is None:
        clients = utils.clients.get_clients()
    evaluators = utils.database.get_evaluators_with_blocked_locations()

    # Pre-emptively add empty columns
    new_cols = [
        "SCHOOL_DISTRICT",
        "LATITUDE",
        "LONGITUDE",
        "CLOSEST_OFFICE",
        "CLOSEST_OFFICE_MILES",
        "SECOND_CLOSEST_OFFICE",
        "SECOND_CLOSEST_OFFICE_MILES",
        "THIRD_CLOSEST_OFFICE",
        "THIRD_CLOSEST_OFFICE_MILES",
        "FLAG",
    ]
    for col in new_cols:
        if col not in clients.columns:
            clients[col] = pd.NA

    clients_to_geocode = utils.database.filter_clients_with_changed_address(clients)

    if force_clients is not None and not force_clients.empty:
        logger.info(f"Force prcessing {len(force_clients)} clients")

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
                "CLOSEST_OFFICE",
                "CLOSEST_OFFICE_MILES",
                "SECOND_CLOSEST_OFFICE",
                "SECOND_CLOSEST_OFFICE_MILES",
                "THIRD_CLOSEST_OFFICE",
                "THIRD_CLOSEST_OFFICE_MILES",
            ]
        ] = clients_to_geocode.apply(utils.location.add_location_data, axis=1)

        clients.set_index("CLIENT_ID", inplace=True)
        clients_to_geocode.set_index("CLIENT_ID", inplace=True)

        clients.index = clients.index.astype(str)
        clients_to_geocode.index = clients_to_geocode.index.astype(str)

        clients.update(clients_to_geocode)

    clients.reset_index(inplace=True)
    utils.database.put_clients_in_db(clients)
    all_clients_from_db = utils.database.get_all_clients()

    force_clients_ids = (
        set(force_clients["CLIENT_ID"]) if force_clients is not None else None
    )

    utils.database.insert_by_matching_criteria(
        all_clients_from_db, evaluators, force_clients_ids
    )

    utils.database.insert_appointments()


def extract_digits(string: str) -> Optional[str]:
    """Extract only digits from a string."""
    digits_only = re.sub(r"\D", "", string)
    return digits_only if digits_only else None


def format_fax_number(string: str) -> Optional[str]:
    """Format a fax number as (XXX) XXX-XXXX."""
    digits_only = re.sub(r"\D", "", string)

    if len(digits_only) != 10:
        return None  # Invalid fax number length

    return f"({digits_only[:3]}) {digits_only[3:6]}-{digits_only[6:]}"


def make_referral_fax_folders(referrals: pd.DataFrame):
    """Make folders for referrals in the TO BE FAXED folder in Google Drive."""
    logger.debug("Making folders for referrals")
    ref_names = utils.spreadsheets.get_unique_values(referrals, "Referral Name")
    # exceptions = {"MUSC", "DDSN", "SC", "NC", "DSS", "MP", "LLC", "CMC"}
    ref_data = []
    for ref_name in ref_names:
        # cleaned_name = " ".join(
        #     [
        #         txt if any(x in exceptions for x in txt.split()) else txt.title()
        #         for txt in ref_name.split()
        #     ]
        # )
        cleaned_name = re.sub(r"\([^)]*\)|[^a-zA-Z\s/.]", "", ref_name).strip()
        raw_fax_number = extract_digits(ref_name)
        fax_number = format_fax_number(raw_fax_number) if raw_fax_number else None
        ref_data.append(
            {
                "cleaned_name": cleaned_name,
                "fax_number": fax_number,
                "raw_fax_number": extract_digits(ref_name),
            }
        )
    fax_folder_id = os.getenv("FAX_FOLDER_ID")
    if fax_folder_id is None:
        logger.error("FAX_FOLDER_ID is not set")
        return
    existing_referral_folders = utils.google.get_items_in_folder(fax_folder_id)
    if existing_referral_folders is None:
        logger.error("Failed to get existing referral folders")
        return
    existing_referral_faxes = [
        extract_digits(folder["name"]) for folder in existing_referral_folders
    ]
    ref_data = [
        entry
        for entry in ref_data
        if entry["raw_fax_number"] not in existing_referral_faxes
        and entry["cleaned_name"] != "No Referral Source"
    ]
    if len(ref_data) == 0:
        logger.debug("No new referral sources to create folders for")
        return
    for ref in ref_data:
        folder_name = ref["cleaned_name"] + " " + ref["fax_number"]
        utils.google.create_folder_in_folder(folder_name, fax_folder_id)

    logger.debug(f"Created {len(ref_data)} folders for referrals")


def process_referrals():
    """Process referrals, creating folders for them in Google Drive."""
    # TODO: Also generate fax pdfs for new referrals that have appointments here
    logger.debug("Processing referrals")
    ref_df = utils.spreadsheets.open_local("temp/input/client-referral-report.csv")
    make_referral_fax_folders(ref_df)


def main():
    """Main entry point for the script.

    This function is responsible for parsing the command line arguments and
    running the appropriate function.

    The available options are:

    * --download-only: Only download the CSVs from TA and exit
    * --openphone: Run the OpenPhone sync and exit
    * --referrals: Run the Referrals process and exit
    * --dirve-ids: Run the Drive IDs process and exit
    * --client-name: Process specific client(s) by name (case insensitive partial match)
    * --client-id: Process specific client(s) by ID

    If none of the above options are specified, the script will run the full
    import_from_ta function normaly.

    :return: None
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--openphone", action="store_true")
    parser.add_argument("--referrals", action="store_true")
    parser.add_argument("--drive-ids", action="store_true")
    parser.add_argument(
        "--client-name",
        type=str,
        help="Process specific client(s) by name (partial match on first/last/preferred name)",
    )
    parser.add_argument("--client-id", type=str, help="Process specific client by ID")
    parser.add_argument(
        "--force-all",
        action="store_true",
        help="Force all clients through geocoding process",
    )
    args = parser.parse_args()

    utils.config.validate_config()

    if not os.getenv("DEV_TOGGLE"):
        logger.debug("Removing temp directory")
        shutil.rmtree("temp", ignore_errors=True)

    if args.download_only:
        logger.info("Running download only")
        utils.download_ta.download_csvs()
        return

    if args.openphone:
        logger.info("Running OpenPhone sync")
        utils.download_ta.download_csvs()
        utils.openphone.sync_openphone()
        return

    if args.referrals:
        logger.info("Running Referrals process")
        utils.download_ta.download_csvs()
        process_referrals()
        return

    if args.drive_ids:
        logger.info("Running Drive IDs process")
        utils.google.add_client_ids_to_drive()
        return

    force_clients: Optional[pd.DataFrame] = None
    clients: Optional[pd.DataFrame] = None

    if args.client_name or args.client_id or args.force_all:
        clients = utils.clients.get_clients()

        if args.force_all:
            logger.info("Force processing ALL clients")
            force_clients = clients
        elif args.client_name or args.client_id:
            force_clients = filter_clients_by_criteria(
                clients, name=args.client_name, client_id=args.client_id
            )

            if force_clients is None or force_clients.empty:
                search_term = args.client_name or args.client_id
                logger.warning(f"No clients found matching '{search_term}'")
                return
            else:
                logger.info(f"Found {len(force_clients)} client(s) matching criteria:")
                # Log the matched clients
                for _, client in force_clients.iterrows():
                    full_name = f"{client.get('FIRSTNAME', '')} {client.get('LASTNAME', '')}".strip()
                    preferred_name = client.get("PREFERRED_NAME", "")
                    name_display = f"{full_name}"
                    if preferred_name and pd.notna(preferred_name):
                        name_display += f" (Preferred: {preferred_name})"
                    logger.info(
                        f"  - {name_display} (ID: {client.get('CLIENT_ID', 'N/A')})"
                    )

    import_from_ta(clients=clients, force_clients=force_clients)
    try:
        process_referrals()
    except Exception as e:
        logger.error(f"Failed to process referrals: {e}")
    try:
        utils.google.add_client_ids_to_drive()
    except Exception as e:
        logger.error(f"Failed to add client IDs to drive: {e}")


if __name__ == "__main__":
    main()
