import hashlib
import json
import os
import re
from datetime import datetime
from typing import Callable, Literal, Optional
from urllib.parse import urlparse

import asana
import mysql.connector
import pandas as pd
import requests
from asana.rest import ApiException
from dotenv import load_dotenv
from geopy import distance
from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim
from geopy.location import Location
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from icecream import ic
from loguru import logger

load_dotenv()

PROVIDER_CREDENTIALING_ID = os.getenv("PROVIDER_CREDENTIALING_ID")
PROVIDER_CREDENTIALING_RANGE = "Prov Credentialing!A1:R16"
TEST_NAMES = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Barbara Steele",
]


### GOOGLE AUTH
# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def init_asana() -> asana.ProjectsApi:
    logger.debug("Initializing Asana")
    configuration = asana.Configuration()
    ASANA_TOKEN = os.environ.get("ASANA_TOKEN")
    if not ASANA_TOKEN:
        raise ValueError("ASANA_TOKEN is not set")
    configuration.access_token = ASANA_TOKEN
    projects_api = asana.ProjectsApi(asana.ApiClient(configuration))
    return projects_api


def get_asana_projects(projects_api: asana.ProjectsApi) -> list | None:
    opts = {
        "limit": 100,
        "archived": False,
        "opt_fields": "name,color,permalink_url,notes",
    }

    logger.debug("Getting Asana projects")
    ASANA_WORKSPACE = os.environ.get("ASANA_WORKSPACE")
    if not ASANA_WORKSPACE:
        raise ValueError("ASANA_WORKSPACE is not set")
    try:
        api_response = list(
            projects_api.get_projects_for_workspace(
                ASANA_WORKSPACE,
                opts,  # pyright: ignore (asana api is strange)
            )
        )
        return api_response

    except ApiException as e:
        logger.error(
            "Exception when calling ProjectsApi->get_projects_for_workspace: %s\n" % e
        )
        return


def search_by_name(projects: list | None, name: str) -> dict | None:
    if not projects:
        return
    filtered_projects = [
        data
        for data in projects
        if name.lower()
        in re.sub(r"\s+", " ", data["name"].replace('"', "")).strip().lower()
    ]
    project_count = len(filtered_projects)

    correct_project = None

    if project_count == 0:
        logger.warning(f"No projects found for {name}.")
    elif project_count == 1:
        logger.debug(f"Found 1 project for {name}.")
        correct_project = filtered_projects[0]
    else:
        logger.warning(f"Found {project_count} projects for {name}.")
    if correct_project:
        return correct_project
    else:
        return None


def get_asd_adhd(project: dict) -> str:
    if r"\basd\b" in project["name"].lower() and r"\badhd\b" in project["name"].lower():
        return "Both"
    elif r"\badhd\b" in project["name"].lower():
        return "ADHD"
    else:
        return "ASD"


def get_interpreter(project: dict) -> bool:
    if "*i*" in project["name"].lower():
        logger.debug(f"{project['name']} includes interpreter")
        return True
    else:
        return False


def get_creds():
    creds = None
    logger.debug("Checking if Google token exists")
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists("auth_cache/token.json"):
        logger.debug("Google token exists")
        creds = Credentials.from_authorized_user_file("auth_cache/token.json", SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    logger.debug("Checking if Google credentials are valid")
    if not creds or not creds.valid:
        logger.warning("Google credentials are not valid")
        if creds and creds.expired and creds.refresh_token:
            logger.debug("Refreshing credentials")
            creds.refresh(Request())
        else:
            logger.debug("Running local auth server")
            flow = InstalledAppFlow.from_client_secrets_file(
                "auth_cache/credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        logger.debug("Saving Google credentials")
        with open("auth_cache/token.json", "w") as token:
            token.write(creds.to_json())
    else:
        logger.debug("Google credentials are valid")
    return creds


def open_local_spreadsheet(file) -> pd.DataFrame:
    with open(file, "r", errors="ignore") as f:
        logger.debug(f"Opening {file}")
        df = pd.read_csv(f)
        return df


def filter_inactive_clients(df: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Filtering inactive clients")
    return df[df.STATUS != "Inactive"]


def normalize_client_names(df: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Normalizing client names")
    for col in ["LASTNAME", "FIRSTNAME", "PREFERRED_NAME"]:
        df[col] = (
            df[col]
            .str.title()
            .replace({"Iiii": "IIII", "Iii": "III", "Ii": "II"}, regex=True)
        )
    df.loc[df.PREFERRED_NAME == df.FIRSTNAME, "PREFERRED_NAME"] = None
    df.loc[df.FIRSTNAME.isin(df.PREFERRED_NAME), "PREFERRED_NAME"] = None
    return df


def remove_test_names(df: pd.DataFrame, test_names: list) -> pd.DataFrame:
    logger.debug("Removing test names")
    return df[
        ~df.apply(lambda row: f"{row.FIRSTNAME} {row.LASTNAME}" in test_names, axis=1)
    ]


def map_insurance_names(clients: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Mapping insurance names")
    insurance_mapping = {
        "Molina Healthcare of South Carolina": "Molina",
        "Humana Behavioral Health (formerly LifeSynch)": "Humana",
        "Absolute Total Care - Medical": "ATC",
        "Select Health of South Carolina": "SH",
        "Healthy Blue South Carolina": "HB",
        "BabyNet (Combined DA and Eval)": "BABYNET",
        "Aetna Health, Inc.": "AETNA",
        "TriCare East": "Tricare",
        "United Healthcare/OptumHealth / OptumHealth Behavioral Solutions": "United_Optum",
        "Medicaid South Carolina": "SCM",
    }
    return clients.replace({"INSURANCE_COMPANYNAME": insurance_mapping})


def consolidate_clients_by_id(clients: pd.DataFrame) -> pd.DataFrame:
    def _merge_secondary_insurance(group: pd.DataFrame) -> pd.Series:
        merged_row = group.iloc[0].copy()
        secondary_insurance = set(
            group[group["POLICY_TYPE"] == "SECONDARY"]["INSURANCE_COMPANYNAME"]
            .dropna()
            .tolist()
        )
        if secondary_insurance:
            merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = list(secondary_insurance)
        else:
            merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = None
        return merged_row

    logger.debug("Consolidating clients by ID")
    merged_df = (
        clients.groupby("CLIENT_ID", as_index=False)
        .apply(_merge_secondary_insurance, include_groups=False)
        .reset_index(drop=True)
    )
    return merged_df


def get_primary_insurance(client: pd.Series) -> str:
    if client["POLICY_TYPE"] == "PRIMARY":
        return client["INSURANCE_COMPANYNAME"]
    else:
        return ""


def combine_client_address_info(clients: pd.DataFrame) -> pd.DataFrame:
    def _combine_address(client) -> str:
        address_parts = []
        for a in [
            client.USER_ADDRESS_ADDRESS1,
            client.USER_ADDRESS_ADDRESS2,
            client.USER_ADDRESS_ADDRESS3,
        ]:
            if not pd.isna(a) and a != "" and a not in address_parts:
                address_parts.append(str(a).strip().replace(",", "").replace('"', ""))
        address = ", ".join(address_parts)

        city = (
            str(client.USER_ADDRESS_CITY).strip()
            if not pd.isna(client.USER_ADDRESS_CITY)
            else ""
        )
        state = (
            str(client.USER_ADDRESS_STATE).strip()
            if not pd.isna(client.USER_ADDRESS_STATE)
            else ""
        )
        zip = (
            str(client.USER_ADDRESS_ZIP).strip().rstrip("-")
            if not pd.isna(client.USER_ADDRESS_ZIP)
            else ""
        )

        if address:
            address += ", "

        address += f"{city}, {state} {zip}"

        return address

    logger.debug("Combining client address info")
    clients["ADDRESS"] = clients.apply(_combine_address, axis=1)

    return clients


def get_evaluators() -> dict:
    creds = get_creds()

    logger.debug("Getting evaluators from Google Sheets")

    service = build("sheets", "v4", credentials=creds)

    # Call the Sheets API
    sheet = service.spreadsheets()
    result = (
        sheet.values()
        .get(
            spreadsheetId=PROVIDER_CREDENTIALING_ID,
            range=PROVIDER_CREDENTIALING_RANGE,
        )
        .execute()
    )
    values = result.get("values", [])

    header_row = values[0]
    data_rows = values[2:]

    evaluators = {}

    # Find the indices of the provider names
    provider_name_indices = {
        name.strip(): i for i, name in enumerate(header_row) if name.strip()
    }

    keys_to_extract = [row[0] for row in data_rows]

    for provider_name, col_index in provider_name_indices.items():
        if (
            col_index > 2
        ):  # Skip the first three columns ('', '# of appointments needed', 'Prior Auth')
            if (
                "-term" in provider_name or "-reports" in provider_name
            ):  # Skip evaluators that have been terminated or quit, and report writers
                continue

            provider_data = {}
            replacements = str.maketrans({" ": "", "/": "_", "-": "_"})

            for i, key in enumerate(keys_to_extract):
                if key.lower().startswith("united/optum"):
                    key = "United/Optum"
                key = key.translate(replacements).strip()
                try:
                    value = data_rows[i][col_index].strip()
                    if key == "NPI" or key == "DistrictInfo" or key == "Offices":
                        provider_data[key] = value
                        continue
                    if value.upper() == "X":
                        provider_data[key] = True
                    elif value.lower() == "denied":
                        provider_data[key] = False
                    elif "/" in value:
                        provider_data[key] = False
                    elif value:
                        provider_data[key] = True
                    else:
                        provider_data[key] = False
                except IndexError:
                    provider_data[key] = False

            evaluators[provider_name.strip()] = provider_data

    return evaluators


def put_evaluators_in_db(evaluators_dict: dict) -> None:
    logger.debug("Inserting evaluators into database")
    db_url = urlparse(os.getenv("DATABASE_URL"))
    db_connection = mysql.connector.connect(
        host=db_url.hostname,
        port=db_url.port,
        user=db_url.username,
        password=db_url.password,
        database=db_url.path[1:],
    )

    cursor = db_connection.cursor()

    sql = """
        INSERT INTO schedule_evaluator (
            npi, providerName, SCM, BABYNET, Molina, MolinaMarketplace, ATC, Humana, SH, HB, AETNA, United_Optum, Districts, Offices
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            providerName = VALUES(providerName),
            SCM = VALUES(SCM),
            BABYNET = VALUES(BABYNET),
            Molina = VALUES(Molina),
            MolinaMarketplace = VALUES(MolinaMarketplace),
            ATC = VALUES(ATC),
            Humana = VALUES(Humana),
            SH = VALUES(SH),
            HB = VALUES(HB),
            AETNA = VALUES(AETNA),
            United_Optum = VALUES(United_Optum),
            Districts = VALUES(Districts),
            Offices = VALUES(Offices);
    """

    for provider_name, provider_data in evaluators_dict.items():
        values = (
            provider_data["NPI"],
            provider_name,
            provider_data["SCM"],
            provider_data["BABYNET"],
            provider_data["Molina"],
            provider_data["MolinaMarketplace"],
            provider_data["ATC"],
            provider_data["Humana"],
            provider_data["SH"],
            provider_data["HB"],
            provider_data["AETNA"],
            provider_data["United_Optum"],
            provider_data["DistrictInfo"],
            provider_data["Offices"],
        )

        try:
            cursor.execute(sql, values)
            cursor.nextset()
            db_connection.commit()
        except mysql.connector.errors.IntegrityError as e:
            logger.error(e)

    db_connection.close()


def get_clients() -> pd.DataFrame:
    logger.debug("Getting clients from spreadsheets")
    insurance_df = open_local_spreadsheet("input/clients-insurance.csv")
    demo_df = open_local_spreadsheet("input/clients-demographics.csv")
    clients_df = pd.merge(demo_df, insurance_df)
    clients_df = filter_inactive_clients(clients_df)
    clients_df = normalize_client_names(clients_df)
    clients_df = remove_test_names(clients_df, TEST_NAMES)
    clients_df = map_insurance_names(clients_df)
    clients_df["PRIMARY_INSURANCE_COMPANYNAME"] = clients_df.apply(
        get_primary_insurance, axis=1
    )
    clients_df = consolidate_clients_by_id(clients_df)
    clients_df = combine_client_address_info(clients_df)
    return clients_df


def remove_previous_clients(clients: pd.DataFrame):
    logger.debug("Checking previous clients")
    db_url = urlparse(os.getenv("DATABASE_URL"))
    db_connection = mysql.connector.connect(
        host=db_url.hostname,
        port=db_url.port,
        user=db_url.username,
        password=db_url.password,
        database=db_url.path[1:],
    )

    cursor = db_connection.cursor()
    cursor.execute("SELECT id, address FROM schedule_client")
    previous_attributes: list = cursor.fetchall()

    for index, row in clients.iterrows():
        client_id = row["CLIENT_ID"]
        address = row["ADDRESS"]
        previous_client_ids = [x[0] for x in previous_attributes]
        previous_addresses = [x[1] for x in previous_attributes]
        for previous_client_id, previous_address in zip(
            previous_client_ids, previous_addresses
        ):
            if client_id == int(previous_client_id) and address == previous_address:
                clients.drop(index, inplace=True)

    return clients


def put_clients_in_db(clients_df):
    logger.debug("Inserting clients into database")
    db_url = urlparse(os.getenv("DATABASE_URL"))
    db_connection = mysql.connector.connect(
        host=db_url.hostname,
        port=db_url.port,
        user=db_url.username,
        password=db_url.password,
        database=db_url.path[1:],
    )

    cursor = db_connection.cursor()

    insert_query = """
        INSERT INTO `schedule_client` (id, hash, asanaId, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, closestOffice, primaryInsurance, secondaryInsurance, privatePay, asdAdhd, interpreter)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            hash = VALUES(hash),
            asanaId = VALUES(asanaId),
            addedDate = VALUES(addedDate),
            dob = VALUES(dob),
            firstName = VALUES(firstName),
            lastName = VALUES(lastName),
            preferredName = VALUES(preferredName),
            fullName = VALUES(fullName),
            address = VALUES(address),
            schoolDistrict = VALUES(schoolDistrict),
            closestOffice = VALUES(closestOffice),
            primaryInsurance = VALUES(primaryInsurance),
            secondaryInsurance = VALUES(secondaryInsurance),
            privatePay = VALUES(privatePay),
            asdAdhd = VALUES(asdAdhd),
            interpreter = VALUES(interpreter);
    """

    for _, client in clients_df.iterrows():
        if isinstance(client.SECONDARY_INSURANCE_COMPANYNAME, list):
            if str(client.SECONDARY_INSURANCE_COMPANYNAME) == "[nan]":
                client.SECONDARY_INSURANCE_COMPANYNAME = None
            else:
                client.SECONDARY_INSURANCE_COMPANYNAME = ",".join(
                    client.SECONDARY_INSURANCE_COMPANYNAME
                )

        record_values = (
            client.CLIENT_ID,
            hashlib.sha256(str(client.CLIENT_ID).encode("utf-8")).hexdigest(),
            client.ASANA_ID if pd.notna(client.ASANA_ID) else None,
            datetime.strptime(client.ADDED_DATE, "%m/%d/%Y").strftime("%Y-%m-%d"),
            datetime.strptime(client.DOB, "%m/%d/%Y").strftime("%Y-%m-%d"),
            client.FIRSTNAME,
            client.LASTNAME,
            client.PREFERRED_NAME if pd.notna(client.PREFERRED_NAME) else None,
            f"{client.FIRSTNAME}{' (' + client.PREFERRED_NAME + ') ' if pd.notna(client.PREFERRED_NAME) else ' '}{client.LASTNAME}",
            client.ADDRESS,
            client.SCHOOL_DISTRICT,
            client.CLOSEST_OFFICE if pd.notna(client.CLOSEST_OFFICE) else None,
            client.PRIMARY_INSURANCE_COMPANYNAME
            if pd.notna(client.PRIMARY_INSURANCE_COMPANYNAME)
            and client.PRIMARY_INSURANCE_COMPANYNAME != ""
            else None,
            client.SECONDARY_INSURANCE_COMPANYNAME
            if pd.notna(client.SECONDARY_INSURANCE_COMPANYNAME)
            else None,
            bool(client.POLICY_PRIVATEPAY),
            client.ASD_ADHD if pd.notna(client.ASD_ADHD) else None,
            client.INTERPRETER,
        )

        try:
            cursor.execute(insert_query, record_values)
            cursor.nextset()
            db_connection.commit()
        except mysql.connector.errors.IntegrityError as e:
            logger.error(e)

    db_connection.close()


def link_client_provider(client_id: str, npi: str) -> None:
    logger.debug(
        f"Inserting client-provider link into database for {client_id} and {npi}",
    )
    db_url = urlparse(os.getenv("DATABASE_URL"))
    db_connection = mysql.connector.connect(
        host=db_url.hostname,
        port=db_url.port,
        user=db_url.username,
        password=db_url.password,
        database=db_url.path[1:],
    )

    cursor = db_connection.cursor()
    insert_query = """
    INSERT INTO schedule_client_eval (client_id, evaluator_npi)
    VALUES (%s, %s)
    ON DUPLICATE KEY UPDATE
        client_id = VALUES(client_id),
        evaluator_npi = VALUES(evaluator_npi)
    """

    values = (client_id, npi)

    cursor.execute(insert_query, values)
    db_connection.commit()
    db_connection.close()


def match_by_insurance(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by insurance for {client.FIRSTNAME} {client.LASTNAME}"
    )
    eligible_evaluators = []

    for evaluator, data in evaluators.items():
        if client.POLICY_PRIVATEPAY == 1:
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if client.INSURANCE_COMPANYNAME in data and data[client.INSURANCE_COMPANYNAME]:
            logger.debug(f"{evaluator} takes {client.INSURANCE_COMPANYNAME}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if client.SECONDARY_INSURANCE_COMPANYNAME:
            secondary_insurance_names = (
                client.SECONDARY_INSURANCE_COMPANYNAME.split(",")
                if isinstance(client.SECONDARY_INSURANCE_COMPANYNAME, str)
                else client.SECONDARY_INSURANCE_COMPANYNAME
            )

            for secondary_insurance in secondary_insurance_names:
                if secondary_insurance in data and data[secondary_insurance]:
                    logger.debug(f"{evaluator} takes {secondary_insurance}")
                    if evaluator not in eligible_evaluators:
                        eligible_evaluators.append(evaluator)

    return eligible_evaluators


def match_by_school_district(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by school district for {client.FIRSTNAME} {client.LASTNAME}"
    )
    if client.SCHOOL_DISTRICT == "Unknown":
        logger.warning(
            f"Client {client.FIRSTNAME} {client.LASTNAME} has no school district, so can't be matched by school district"
        )
        return []

    for evaluator, data in evaluators.items():
        data["DistrictInfo"] = re.sub(r"\s*\([^)]*\)", "", data["DistrictInfo"]).strip()
        data["DistrictInfo"].lower().replace("no", "").strip()

    eligible_evaluators = []
    for evaluator, data in evaluators.items():
        if data["DistrictInfo"].lower() == "all":
            logger.debug(f"{evaluator} is ok for {client.SCHOOL_DISTRICT}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)
        if client.SCHOOL_DISTRICT.lower() not in data["DistrictInfo"].lower():
            logger.debug(f"{evaluator} is ok for {client.SCHOOL_DISTRICT}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

    return eligible_evaluators


def insert_by_matching_criteria(clients: pd.DataFrame, evaluators: dict):
    for _, client in clients.iterrows():
        eligible_evaluators_by_district = match_by_school_district(client, evaluators)
        eligible_evaluators_by_insurance = match_by_insurance(client, evaluators)

        matched_evaluators = list(
            set(eligible_evaluators_by_district) & set(eligible_evaluators_by_insurance)
        )
        for evaluator in matched_evaluators:
            link_client_provider(client.CLIENT_ID, evaluators[evaluator]["NPI"])


def search_census(params: dict) -> tuple[str, dict] | None:
    response = requests.get(
        "https://geocoding.geo.census.gov/geocoder/geographies/address", params=params
    )
    response.raise_for_status()
    data = response.json()

    if data["result"]["addressMatches"]:
        district: str = data["result"]["addressMatches"][0]["geographies"][
            "Unified School Districts"
        ][0]["NAME"]
        coordinates = data["result"]["addressMatches"][0]["coordinates"]
        return district, coordinates
    else:
        return None


def get_client_census_data(client: pd.Series) -> tuple[str, dict] | Literal["Unknown"]:
    params = {
        "street": (
            str(client.USER_ADDRESS_ADDRESS1).strip()
            if not pd.isna(client.USER_ADDRESS_ADDRESS1)
            else None
        ),
        "city": (
            str(client.USER_ADDRESS_CITY).strip()
            if not pd.isna(client.USER_ADDRESS_CITY)
            else None
        ),
        "state": (
            str(client.USER_ADDRESS_STATE).strip()
            if not pd.isna(client.USER_ADDRESS_STATE)
            else None
        ),
        "zip": (
            str(client.USER_ADDRESS_ZIP).strip().rstrip("-")
            if not pd.isna(client.USER_ADDRESS_ZIP)
            else None
        ),
        "benchmark": "Public_AR_Current",
        "format": "json",
        "vintage": "Current_Current",
        "layers": 14,
    }

    if any(param is None for param in params.values()):
        logger.warning("Client address is incomplete, skipping district search.")
        return "Unknown"

    try:
        logger.debug(
            f"Searching for school district for {params['street']} {params['city']}, {params['state']} {params['zip']}"
        )
        census_data = search_census(params)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.warning("Search failed, attempting again without a ZIP code...")
        params_without_zip = params.copy()
        params_without_zip.pop("zip")
        census_data = search_census(params_without_zip)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.warning("Search failed again, attempting with ZIP but without city...")
        params_without_city = params.copy()
        params_without_city.pop("city")
        census_data = search_census(params_without_city)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.error("No district found.")
        return "Unknown"
    except requests.RequestException as e:
        logger.error(f"Error fetching school district data: {e}")
        return "Unknown"


def map_district_name(district: str) -> str:
    district_replacements = {
        "Bamberg County School District": "Bamberg",
        "Berkeley County School District": "Berkeley",
        "Charleston County School District": "Charleston",
        "Colleton County School District": "Colleton",
        "Dorchester School District 2": "DD2",
        "Dorchester School District 4": "DD4",
        "Georgetown County School District": "Georgetown",
        "Horry County School District": "Horry",
        "Orangeburg County School District": "Orangeburg",
        "Richland School District 2": "Richland 2",
    }

    for old, new in district_replacements.items():
        district = district.replace(old, new)

    return district


GEOLOCATOR = Nominatim(user_agent="driftwood-schedule-helper")
geocode: Callable[[str], Optional[Location]] = RateLimiter(
    GEOLOCATOR.geocode, min_delay_seconds=2
)


def geocode_address(client: pd.Series) -> Location | None:
    logger.debug(f"Geocoding {client.ADDRESS}")

    street_address = (
        str(client.USER_ADDRESS_ADDRESS1).strip()
        if not pd.isna(client.USER_ADDRESS_ADDRESS1)
        else ""
    )

    city = (
        str(client.USER_ADDRESS_CITY).strip()
        if not pd.isna(client.USER_ADDRESS_CITY)
        else ""
    )
    state = (
        str(client.USER_ADDRESS_STATE).strip()
        if not pd.isna(client.USER_ADDRESS_STATE)
        else ""
    )
    zip = (
        str(client.USER_ADDRESS_ZIP).strip().rstrip("-")
        if not pd.isna(client.USER_ADDRESS_ZIP)
        else ""
    )

    attempt_string = client.ADDRESS
    geocoded_location = geocode(attempt_string)

    if geocoded_location is None and (
        not pd.isna(client.USER_ADDRESS_ADDRESS2)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS2.lower()
        or not pd.isna(client.USER_ADDRESS_ADDRESS3)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS3.lower()
    ):
        logger.warning(
            f"Location data not found for {attempt_string}, trying again with Address 2/3 removed"
        )
        attempt_string = " ".join([street_address, city, state, zip])
        geocoded_location = geocode(attempt_string)

    if geocoded_location is None:
        logger.warning(
            f"Location data not found for {attempt_string}, trying again without street number"
        )
        attempt_string = " ".join(attempt_string.split(" ")[1:])
        geocoded_location = geocode(attempt_string)

        if geocoded_location is None:
            logger.warning(
                f"Location data not found for {attempt_string}, trying again without street"
            )
            attempt_string = city + ", " + state + " " + zip
            geocoded_location = geocode(attempt_string)

            if geocoded_location is None:
                logger.warning(
                    f"Location data not found for {attempt_string}, trying again with just ZIP"
                )
                attempt_string = zip
                geocoded_location = geocode(attempt_string)

                if geocoded_location is None:
                    logger.error(f"Location data not found for {attempt_string}")
    if geocoded_location:
        logger.debug(
            f"Geocoded {attempt_string} to {geocoded_location.latitude}, {geocoded_location.longitude}"
        )
    return geocoded_location


def get_offices() -> dict:
    logger.debug("Getting offices")
    office_env = os.getenv("OFFICE_ADDRESSES")
    if office_env is None:
        raise ValueError("OFFICE_ADDRESSES not set")

    addresses = {}
    for address in office_env.split(";"):
        key, values = address.split(":")
        latitude, longitude, pretty_name = values.split(",")
        addresses[key] = {
            "latitude": latitude,
            "longitude": longitude,
            "pretty_name": pretty_name,
        }
    return addresses


OFFICES = get_offices()


def calculate_closest_office(client: pd.Series, latitude: str, longitude: str) -> str:
    closest_miles = float("inf")
    closest_office = "Unknown"
    for office_name, office in OFFICES.items():
        miles = distance.distance(
            (latitude, longitude),
            (office["latitude"], office["longitude"]),
        ).miles
        logger.debug(
            f"{office_name} office is {int(miles)} miles away from {client.FIRSTNAME} {client.LASTNAME}"
        )
        if miles < closest_miles:
            closest_office = office_name
            closest_miles = miles
    return closest_office


def get_closest_office(client: pd.Series) -> str:
    logger.debug(f"Getting closest office for {client['ADDRESS']}")

    if pd.isna(client.ADDRESS) or client.ADDRESS is None or client.ADDRESS == "":
        logger.error(f"{client.FIRSTNAME} {client.LASTNAME} has no address")
        return "Unknown"

    if not pd.isna(client.LATITUDE) and not pd.isna(client.LONGITUDE):
        return calculate_closest_office(client, client.LATITUDE, client.LONGITUDE)

    geocoded_location = geocode_address(client)
    if geocoded_location is None:
        logger.error(f"Location data not found for {client['ADDRESS']}")
        return "Unknown"

    return calculate_closest_office(
        client, geocoded_location.latitude, geocoded_location.longitude
    )


def main():
    projects_api = init_asana()
    asana_projects = get_asana_projects(projects_api)

    clients = get_clients()
    evaluators = get_evaluators()
    appointments_df = open_local_spreadsheet("input/clients-appointments.csv")

    clients = clients.sample(10)

    clients = remove_previous_clients(clients)

    for index, client in clients.iterrows():
        asana_project = search_by_name(
            asana_projects, f"{client.FIRSTNAME} {client.LASTNAME}"
        )
        asana_id = None
        asd_adhd = None
        interpreter = False
        if asana_project:
            asana_id = asana_project["gid"]
            asd_adhd = get_asd_adhd(asana_project)
            interpreter = get_interpreter(asana_project)

        clients.at[index, "ASANA_ID"] = asana_id
        clients.at[index, "ASD_ADHD"] = asd_adhd
        clients.at[index, "INTERPRETER"] = interpreter

        census_result = get_client_census_data(client)

        if census_result != "Unknown":
            clients.at[index, "SCHOOL_DISTRICT"], coordinates = census_result
        else:
            clients.at[index, "SCHOOL_DISTRICT"] = "Unknown"
            coordinates = None

        if isinstance(coordinates, dict):
            clients.at[index, "LATITUDE"] = coordinates.get("y")
            clients.at[index, "LONGITUDE"] = coordinates.get("x")

    clients["CLOSEST_OFFICE"] = clients.apply(get_closest_office, axis=1)

    put_evaluators_in_db(evaluators)
    put_clients_in_db(clients)

    insert_by_matching_criteria(clients, evaluators)


if __name__ == "__main__":
    main()
