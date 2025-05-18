import json
import os
from datetime import datetime
from typing import Callable, Optional

import mysql.connector
import pandas as pd
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
        df[col] = df[col].str.title().replace({"Iii": "III", "Ii": "II"}, regex=True)
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
                "-term" in provider_name
            ):  # Skip evaluators that have been terminated or quit
                continue
            provider_data = {}
            for i, key in enumerate(keys_to_extract):
                if key.lower().startswith("united/optum"):
                    key = "United/Optum"
                try:
                    value = data_rows[i][col_index].strip()
                    if key == "NPI":
                        provider_data["NPI"] = value
                        continue
                    if key.startswith("Location"):
                        provider_data["Location"] = value
                        continue
                    if value.upper() == "X":
                        provider_data[
                            key.replace(" ", "")
                            .replace("/", "_")
                            .replace("-", "_")
                            .strip()
                        ] = True
                    elif value.lower() == "denied":
                        provider_data[
                            key.replace(" ", "")
                            .replace("/", "_")
                            .replace("-", "_")
                            .strip()
                        ] = False
                    elif "/" in value:
                        provider_data[
                            key.replace(" ", "")
                            .replace("/", "_")
                            .replace("-", "_")
                            .strip()
                        ] = False
                    elif value:
                        provider_data[
                            key.replace(" ", "")
                            .replace("/", "_")
                            .replace("-", "_")
                            .strip()
                        ] = True
                    else:
                        provider_data[
                            key.replace(" ", "")
                            .replace("/", "_")
                            .replace("-", "_")
                            .strip()
                        ] = False
                except IndexError:
                    provider_data[
                        key.replace(" ", "").replace("/", "_").replace("-", "_").strip()
                    ] = False
            evaluators[provider_name.strip()] = provider_data

    return evaluators


def put_evaluators_in_db(evaluators_dict: dict) -> None:
    logger.debug("Inserting evaluators into database")
    db_connection = mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

    cursor = db_connection.cursor()

    sql = """
        INSERT INTO schedule-helper_evaluators (
            npi, providerName, SCM, BABYNET, Molina, MolinaMarketplace, ATC, Humana, SH, HB, AETNA, TriCare, United_Optum, Location
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            TriCare = VALUES(TriCare),
            United_Optum = VALUES(United_Optum),
            Location = VALUES(Location)
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
            provider_data["TriCare"],
            provider_data["United_Optum"],
            provider_data["Location"],
        )

        try:
            cursor.execute(sql, values)
        except mysql.connector.errors.IntegrityError:
            pass

    db_connection.commit()
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
    clients_df = consolidate_clients_by_id(clients_df)
    clients_df = combine_client_address_info(clients_df)
    return clients_df


def put_clients_in_db(clients_df):
    logger.debug("Inserting clients into database")
    db_connection = mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

    cursor = db_connection.cursor()

    insert_query = """
        INSERT INTO `schedule-helper_clients` (id, added_date, dob, firstname, lastname, preferredName, address, closestOffice, primaryInsurance, secondaryInsurance)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            added_date = VALUES(added_date),
            dob = VALUES(dob),
            firstname = VALUES(firstname),
            lastname = VALUES(lastname),
            preferredName = VALUES(preferredName),
            address = VALUES(address),
            closestOffice = VALUES(closestOffice),
            primaryInsurance = VALUES(primaryInsurance),
            secondaryInsurance = VALUES(secondaryInsurance)
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
            datetime.strptime(client.ADDED_DATE, "%m/%d/%Y").strftime("%Y-%m-%d"),
            datetime.strptime(client.DOB, "%m/%d/%Y").strftime("%Y-%m-%d"),
            client.FIRSTNAME,
            client.LASTNAME,
            client.PREFERRED_NAME if pd.notna(client.PREFERRED_NAME) else None,
            client.ADDRESS,
            client.CLOSEST_OFFICE if pd.notna(client.CLOSEST_OFFICE) else None,
            client.INSURANCE_COMPANYNAME
            if pd.notna(client.INSURANCE_COMPANYNAME)
            else None,
            client.SECONDARY_INSURANCE_COMPANYNAME
            if pd.notna(client.SECONDARY_INSURANCE_COMPANYNAME)
            else None,
        )

        try:
            cursor.execute(insert_query, record_values)
        except mysql.connector.errors.IntegrityError:
            continue

    db_connection.commit()
    db_connection.close()


def link_client_provider(client_id: str, provider_id: str) -> None:
    logger.debug(
        f"Inserting client-provider link into database for {client_id} and %{provider_id}",
    )
    db_connection = mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )

    cursor = db_connection.cursor()

    insert_query = """
    INSERT INTO schedule-helper_client_providers (client_id, provider_id)
    VALUES (%s, %s)
    ON DUPLICATE KEY UPDATE
        client_id = VALUES(client_id),
        provider_id = VALUES(provider_id)
    """

    values = (client_id, provider_id)

    cursor.execute(insert_query, values)
    db_connection.commit()
    db_connection.close()


def match_by_insurance(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by insurance for {client.FIRSTNAME} {client.LASTNAME}"
    )
    eligible_evaluators = []
    for evaluator, data in evaluators.items():
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


GEOLOCATOR = Nominatim(user_agent="driftwood-schedule-helper")
geocode: Callable[[str], Optional[Location]] = RateLimiter(
    GEOLOCATOR.geocode, min_delay_seconds=1
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
        and client.USER_ADDRESS_ADDRESS1 != client.USER_ADDRESS_ADDRESS2
        or not pd.isna(client.USER_ADDRESS_ADDRESS3)
        and client.USER_ADDRESS_ADDRESS1 != client.USER_ADDRESS_ADDRESS3
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


def get_offices():
    logger.debug("Getting offices")
    office_env = os.getenv("OFFICE_ADDRESSES")
    if office_env is None:
        raise ValueError("OFFICE_ADDRESSES not set")
    return json.loads(office_env)


OFFICES = get_offices()


def get_closest_office(client: pd.Series) -> str:
    logger.debug(f"Getting closest office for {client['ADDRESS']}")
    geocoded_location = geocode_address(client)
    closest_office = "Unknown"
    if geocoded_location is None:
        logger.error(f"Location data not found for {client['ADDRESS']}")
        return closest_office
    closest_miles = float("inf")
    for office_name, office in OFFICES.items():
        miles = distance.distance(
            (geocoded_location.latitude, geocoded_location.longitude),
            (office["latitude"], office["longitude"]),
        ).miles
        logger.debug(
            f"{office_name} office is {int(miles)} miles away from {client.FIRSTNAME} {client.LASTNAME}"
        )
        if miles < closest_miles:
            closest_office = office_name
            closest_miles = miles
    return closest_office


clients = get_clients()
evaluators = get_evaluators()
test_amount = 5
while True:
    sampled_clients = clients.sample(n=test_amount)
    if any(
        pd.notna(client.USER_ADDRESS_ADDRESS2)
        for _, client in sampled_clients.iterrows()
    ):
        break
clients = sampled_clients
clients["CLOSEST_OFFICE"] = clients.apply(get_closest_office, axis=1)
clients["INSURANCE_EVALUATORS"] = clients.apply(
    lambda client: match_by_insurance(client, evaluators), axis=1
)

print(
    clients[
        ["FIRSTNAME", "LASTNAME", "ADDRESS", "CLOSEST_OFFICE", "INSURANCE_EVALUATORS"]
    ]
)
