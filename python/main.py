import argparse
import os
import shutil

import pandas as pd
from dotenv import load_dotenv
from loguru import logger

import utils.clients
import utils.config
import utils.database
import utils.download_ta
import utils.location
import utils.openphone

load_dotenv()

logger.add("logs/winnonah-python.log", rotation="500 MB")


def import_from_ta():
    """Imports data from TA CSVs into the database."""
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
    ]
    for col in new_cols:
        if col not in clients.columns:
            clients[col] = pd.NA

    clients_to_geocode = utils.database.filter_clients_with_changed_address(clients)

    if not clients_to_geocode.empty:
        logger.debug(f"Found {len(clients_to_geocode)} clients to geocode")

        clients_to_geocode[["SCHOOL_DISTRICT", "LATITUDE", "LONGITUDE"]] = (
            clients_to_geocode.apply(utils.location.add_census_data, axis=1)
        )

        clients_to_geocode[
            [
                "CLOSEST_OFFICE",
                "CLOSEST_OFFICE_MILES",
                "SECOND_CLOSEST_OFFICE",
                "SECOND_CLOSEST_OFFICE_MILES",
                "THIRD_CLOSEST_OFFICE",
                "THIRD_CLOSEST_OFFICE_MILES",
            ]
        ] = clients_to_geocode.apply(
            utils.location.get_closest_offices, axis=1, result_type="expand"
        )

        clients.set_index("CLIENT_ID", inplace=True)
        clients_to_geocode.set_index("CLIENT_ID", inplace=True)

        clients.index = clients.index.astype(str)
        clients_to_geocode.index = clients_to_geocode.index.astype(str)

        clients.update(clients_to_geocode)

    clients.reset_index(inplace=True)

    utils.database.put_clients_in_db(clients)

    all_clients_from_db = utils.database.get_all_clients()

    utils.database.insert_by_matching_criteria(all_clients_from_db, evaluators)

    # shutil.rmtree("temp", ignore_errors=True)


def main():
    """Main entry point for the script.

    This function is responsible for parsing the command line arguments and
    running the appropriate function.

    The available options are:

    * --download-only: Only download the CSVs from TA and exit
    * --openphone: Run the OpenPhone sync and exit

    If neither of the above options are specified, the script will run the full
    import_from_ta function, which will download the CSVs from TA, import them
    into the database, and then sync the OpenPhone numbers.

    :return: None
    """
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--openphone", action="store_true")
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

    import_from_ta()


if __name__ == "__main__":
    main()
