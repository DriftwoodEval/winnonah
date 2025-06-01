import utils.asana
import utils.clients
import utils.database
import utils.google
import utils.location
from dotenv import load_dotenv

load_dotenv()


def main():
    projects_api = utils.asana.init()
    asana_projects = utils.asana.get_projects(projects_api)

    clients = utils.clients.get_clients()
    evaluators = utils.google.get_evaluators()

    clients = clients.sample(10)

    clients = utils.database.remove_previous_clients(clients)

    for index, client in clients.iterrows():
        asana_project = utils.asana.search_by_name(
            asana_projects, f"{client.FIRSTNAME} {client.LASTNAME}"
        )
        asana_id = None
        asd_adhd = None
        interpreter = False
        if asana_project:
            asana_id = asana_project["gid"]
            asd_adhd = utils.asana.is_asd_adhd(asana_project)
            interpreter = utils.asana.is_interpreter(asana_project)

        clients.at[index, "ASANA_ID"] = asana_id
        clients.at[index, "ASD_ADHD"] = asd_adhd
        clients.at[index, "INTERPRETER"] = interpreter

        census_result = utils.location.get_client_census_data(client)

        if census_result != "Unknown":
            clients.at[index, "SCHOOL_DISTRICT"], coordinates = census_result
        else:
            clients.at[index, "SCHOOL_DISTRICT"] = "Unknown"
            coordinates = None

        if isinstance(coordinates, dict):
            clients.at[index, "LATITUDE"] = coordinates.get("y")
            clients.at[index, "LONGITUDE"] = coordinates.get("x")

    clients[
        [
            "CLOSEST_OFFICE",
            "CLOSEST_OFFICE_MILES",
            "SECOND_CLOSEST_OFFICE",
            "SECOND_CLOSEST_OFFICE_MILES",
            "THIRD_CLOSEST_OFFICE",
            "THIRD_CLOSEST_OFFICE_MILES",
        ]
    ] = clients.apply(utils.location.get_closest_offices, axis=1, result_type="expand")

    utils.database.put_evaluators_in_db(evaluators)
    utils.database.put_clients_in_db(clients)

    utils.database.insert_by_matching_criteria(clients, evaluators)


if __name__ == "__main__":
    main()
