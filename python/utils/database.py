import hashlib
import os
from datetime import datetime
from urllib.parse import urlparse

import pandas as pd
import pymysql.cursors
import utils.relationships
from dotenv import load_dotenv
from loguru import logger

load_dotenv()


def open_local_spreadsheet(file) -> pd.DataFrame:
    try:
        with open(file, "r", encoding="utf-8") as f:
            logger.debug(f"Opening {file}")
            df = pd.read_csv(f)
    except UnicodeDecodeError:
        logger.warning(f"UnicodeDecodeError for {file}")
        with open(file, "r", encoding="latin1") as f:
            logger.debug(f"Opening {file} with latin1 encoding")
            df = pd.read_csv(f)
    return df


def get_db():
    db_url = urlparse(os.getenv("DATABASE_URL", ""))
    connection = pymysql.connect(
        host=db_url.hostname,
        port=db_url.port or 3306,
        user=db_url.username,
        password=db_url.password or "",
        database=db_url.path[1:],
        cursorclass=pymysql.cursors.DictCursor,
    )
    return connection


def put_evaluators_in_db(evaluators_dict: dict) -> None:
    logger.debug("Inserting evaluators into database")
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = """
                INSERT INTO emr_evaluator (
                    npi, providerName, email, SCM, BabyNet, Molina, MolinaMarketplace, ATC, Humana, SH, HB, AETNA, United_Optum, Districts, Offices
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    providerName = VALUES(providerName),
                    email = VALUES(email),
                    SCM = VALUES(SCM),
                    BabyNet = VALUES(BabyNet),
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
                    provider_data["Email"],
                    provider_data["SCM"],
                    provider_data["BabyNet"],
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

                cursor.execute(sql, values)

        db_connection.commit()


def set_inactive_clients(clients_df: pd.DataFrame):
    logger.debug("Setting inactive clients")
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = "UPDATE emr_client SET status = 0 WHERE id = %s"
            for _, client in clients_df.iterrows():
                client_id = client["CLIENT_ID"]
                cursor.execute(sql, (client_id,))

        db_connection.commit()


def remove_previous_clients(clients: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Skipping clients already in database with same address")
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT id, address FROM emr_client")
            previous_clients = {tuple(row) for row in cursor.fetchall()}

            clients = clients[
                ~clients.apply(
                    lambda row: (row["CLIENT_ID"], row["ADDRESS"]) in previous_clients,
                    axis=1,
                )
            ]

            return clients


def put_clients_in_db(clients_df):
    logger.debug("Inserting clients into database")
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = """
                INSERT INTO `emr_client` (id, hash, status, asanaId, archivedInAsana, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, closestOffice, closestOfficeMiles, secondClosestOffice, secondClosestOfficeMiles, thirdClosestOffice, thirdClosestOfficeMiles, primaryInsurance, secondaryInsurance, privatePay, asdAdhd, interpreter, gender, phoneNumber)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    hash = VALUES(hash),
                    status = VALUES(status),
                    asanaId = VALUES(asanaId),
                    archivedInAsana = VALUES(archivedInAsana),
                    addedDate = VALUES(addedDate),
                    dob = VALUES(dob),
                    firstName = VALUES(firstName),
                    lastName = VALUES(lastName),
                    preferredName = VALUES(preferredName),
                    fullName = VALUES(fullName),
                    address = VALUES(address),
                    schoolDistrict = VALUES(schoolDistrict),
                    closestOffice = VALUES(closestOffice),
                    closestOfficeMiles = VALUES(closestOfficeMiles),
                    secondClosestOffice = VALUES(secondClosestOffice),
                    secondClosestOfficeMiles = VALUES(secondClosestOfficeMiles),
                    thirdClosestOffice = VALUES(thirdClosestOffice),
                    thirdClosestOfficeMiles = VALUES(thirdClosestOfficeMiles),
                    primaryInsurance = VALUES(primaryInsurance),
                    secondaryInsurance = VALUES(secondaryInsurance),
                    privatePay = VALUES(privatePay),
                    asdAdhd = VALUES(asdAdhd),
                    interpreter = VALUES(interpreter),
                    gender = VALUES(gender),
                    phoneNumber = VALUES(phoneNumber);
            """

            for _, client in clients_df.iterrows():
                if isinstance(client.SECONDARY_INSURANCE_COMPANYNAME, list):
                    if str(client.SECONDARY_INSURANCE_COMPANYNAME) == "[nan]":
                        client.SECONDARY_INSURANCE_COMPANYNAME = None
                    else:
                        client.SECONDARY_INSURANCE_COMPANYNAME = ",".join(
                            client.SECONDARY_INSURANCE_COMPANYNAME
                        )

                values = (
                    client.CLIENT_ID,
                    hashlib.sha256(str(client.CLIENT_ID).encode("utf-8")).hexdigest(),
                    not client.STATUS == "Inactive",
                    client.ASANA_ID if pd.notna(client.ASANA_ID) else None,
                    client.ARCHIVED_IN_ASANA,
                    datetime.strptime(client.ADDED_DATE, "%m/%d/%Y").strftime(
                        "%Y-%m-%d"
                    ),
                    datetime.strptime(client.DOB, "%m/%d/%Y").strftime("%Y-%m-%d"),
                    client.FIRSTNAME,
                    client.LASTNAME,
                    client.PREFERRED_NAME if pd.notna(client.PREFERRED_NAME) else None,
                    f"{client.FIRSTNAME}{' (' + client.PREFERRED_NAME + ') ' if pd.notna(client.PREFERRED_NAME) else ' '}{client.LASTNAME}",
                    client.ADDRESS,
                    client.SCHOOL_DISTRICT,
                    client.CLOSEST_OFFICE if pd.notna(client.CLOSEST_OFFICE) else None,
                    client.CLOSEST_OFFICE_MILES
                    if pd.notna(client.CLOSEST_OFFICE_MILES)
                    and client.CLOSEST_OFFICE != "Unknown"
                    else None,
                    client.SECOND_CLOSEST_OFFICE
                    if pd.notna(client.SECOND_CLOSEST_OFFICE)
                    else None,
                    client.SECOND_CLOSEST_OFFICE_MILES
                    if pd.notna(client.SECOND_CLOSEST_OFFICE_MILES)
                    and client.SECOND_CLOSEST_OFFICE != "Unknown"
                    else None,
                    client.THIRD_CLOSEST_OFFICE
                    if pd.notna(client.THIRD_CLOSEST_OFFICE)
                    else None,
                    client.THIRD_CLOSEST_OFFICE_MILES
                    if pd.notna(client.THIRD_CLOSEST_OFFICE_MILES)
                    and client.THIRD_CLOSEST_OFFICE != "Unknown"
                    else None,
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
                    client.GENDER.title().split(".")[-1]
                    if pd.notna(client.GENDER)
                    else None,
                    f"{client.PHONE1:.0f}" if pd.notna(client.PHONE1) else None,
                )

                cursor.execute(sql, values)

        db_connection.commit()


def link_client_provider(client_id: str, npi: str) -> None:
    logger.debug(
        f"Inserting client-provider link into database for {client_id} and {npi}",
    )
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = """
            INSERT INTO emr_client_eval (clientId, evaluatorNpi)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE
                clientId = VALUES(clientId),
                evaluatorNpi = VALUES(evaluatorNpi)
            """

            values = (client_id, npi)

            cursor.execute(sql, values)

        db_connection.commit()


def insert_by_matching_criteria(clients: pd.DataFrame, evaluators: dict):
    for _, client in clients.iterrows():
        eligible_evaluators_by_district = utils.relationships.match_by_school_district(
            client, evaluators
        )
        eligible_evaluators_by_insurance = utils.relationships.match_by_insurance(
            client, evaluators
        )
        eligible_evaluators_by_office = utils.relationships.match_by_office(
            client, evaluators
        )

        matched_evaluators = list(
            set(eligible_evaluators_by_district)
            & set(eligible_evaluators_by_insurance)
            & set(eligible_evaluators_by_office)
        )
        for evaluator in matched_evaluators:
            link_client_provider(client.CLIENT_ID, evaluators[evaluator]["NPI"])
