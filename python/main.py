import argparse
import shutil

import pandas as pd
import utils.asana
import utils.clients
import utils.config
import utils.database
import utils.download_ta
import utils.google
import utils.location
from dotenv import load_dotenv
from loguru import logger

load_dotenv()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()

    utils.config.validate_config()

    shutil.rmtree("temp", ignore_errors=True)

    if args.download_only:
        logger.info("Running download only")
        utils.download_ta.download_csvs()
        return

    projects_api = utils.asana.init()
    asana_projects = utils.asana.get_projects(projects_api)

    clients = utils.clients.get_clients()
    evaluators = utils.google.get_evaluators()

    utils.database.put_evaluators_in_db(evaluators)

    # clients = clients[clients["LASTNAME"] == "Testson"]

    new_clients = utils.database.filter_clients_with_changed_address(clients)

    missing_asana_clients = utils.database.get_missing_asana_clients()

    if not missing_asana_clients.empty:
        for index, client in missing_asana_clients.iterrows():
            asana_id = None
            asd_adhd = None
            interpreter = False
            archived_in_asana = False
            asana_project = utils.asana.search_by_name(
                asana_projects, str(client.CLIENT_ID)
            )
            if not asana_project:
                asana_project = utils.asana.search_and_add_id(
                    projects_api, asana_projects, client
                )
            if asana_project:
                asana_id = asana_project["gid"]
                asd_adhd = utils.asana.is_asd_adhd(asana_project)
                interpreter = utils.asana.is_interpreter(asana_project)
                archived_in_asana = asana_project["archived"]

            missing_asana_clients.at[index, "ASANA_ID"] = asana_id
            missing_asana_clients.at[index, "ASD_ADHD"] = asd_adhd
            missing_asana_clients.at[index, "INTERPRETER"] = interpreter
            missing_asana_clients.at[index, "ARCHIVED_IN_ASANA"] = archived_in_asana

        utils.database.update_asana_information(missing_asana_clients)

    if not new_clients.empty:
        for index, client in clients.iterrows():
            asana_id = None
            asd_adhd = None
            interpreter = False
            archived_in_asana = False
            asana_project = utils.asana.search_by_name(
                asana_projects, str(client.CLIENT_ID)
            )
            if asana_project:
                asana_id = asana_project["gid"]
                asd_adhd = utils.asana.is_asd_adhd(asana_project)
                interpreter = utils.asana.is_interpreter(asana_project)
                archived_in_asana = asana_project["archived"]

            new_clients.at[index, "ASANA_ID"] = asana_id
            new_clients.at[index, "ASD_ADHD"] = asd_adhd
            new_clients.at[index, "INTERPRETER"] = interpreter
            new_clients.at[index, "ARCHIVED_IN_ASANA"] = archived_in_asana

            if (
                pd.isna(client.ADDRESS)
                or client.ADDRESS is None
                or client.ADDRESS == ""
            ):
                new_clients.at[index, "SCHOOL_DISTRICT"] = "Unknown"
            else:
                census_result = utils.location.get_client_census_data(client)

                if census_result != "Unknown":
                    new_clients.at[index, "SCHOOL_DISTRICT"], coordinates = (
                        census_result
                    )
                else:
                    new_clients.at[index, "SCHOOL_DISTRICT"] = "Unknown"
                    coordinates = None

                if isinstance(coordinates, dict):
                    new_clients.at[index, "LATITUDE"] = coordinates.get("y")
                    new_clients.at[index, "LONGITUDE"] = coordinates.get("x")

        new_clients[
            [
                "CLOSEST_OFFICE",
                "CLOSEST_OFFICE_MILES",
                "SECOND_CLOSEST_OFFICE",
                "SECOND_CLOSEST_OFFICE_MILES",
                "THIRD_CLOSEST_OFFICE",
                "THIRD_CLOSEST_OFFICE_MILES",
            ]
        ] = new_clients.apply(
            utils.location.get_closest_offices, axis=1, result_type="expand"
        )

        utils.database.put_clients_in_db(new_clients)

        utils.database.insert_by_matching_criteria(new_clients, evaluators)

    shutil.rmtree("temp", ignore_errors=True)


if __name__ == "__main__":
    main()
