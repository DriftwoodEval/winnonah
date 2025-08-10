import hashlib
import os
from datetime import datetime
from urllib.parse import urlparse

import pandas as pd
import pymysql.cursors
import utils.relationships
from dotenv import load_dotenv
from loguru import logger
from utils.misc import get_column

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


def sync_client_statuses(clients_df: pd.DataFrame):
    """
    Updates the status for all clients in the DataFrame.
    - Sets status to 1 for active clients.
    - Sets status to 0 for inactive clients.
    """
    logger.debug("Syncing all client statuses")

    active_ids = tuple(
        clients_df[clients_df["STATUS"] == "Active"]["CLIENT_ID"].tolist()
    )
    inactive_ids = tuple(
        clients_df[clients_df["STATUS"] == "Inactive"]["CLIENT_ID"].tolist()
    )

    db_connection = get_db()
    try:
        with db_connection.cursor() as cursor:
            if active_ids:
                logger.debug(f"Activating {len(active_ids)} clients.")
                sql_activate = "UPDATE emr_client SET status = 1 WHERE id IN %s"
                cursor.execute(sql_activate, (active_ids,))

            if inactive_ids:
                logger.debug(f"Deactivating {len(inactive_ids)} clients.")
                sql_deactivate = "UPDATE emr_client SET status = 0 WHERE id IN %s"
                cursor.execute(sql_deactivate, (inactive_ids,))

        db_connection.commit()
        logger.debug("Client status sync complete.")

    except Exception as e:
        logger.error(f"Database error during client sync: {e}")
        db_connection.rollback()
    finally:
        db_connection.close()


def filter_clients_with_changed_address(clients: pd.DataFrame) -> pd.DataFrame:
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT id, LOWER(address) as address FROM emr_client")
            previous_clients = {row["id"]: row["address"] for row in cursor.fetchall()}

            clients["ADDRESS_CHANGED"] = clients.apply(
                lambda row: previous_clients.get(row["CLIENT_ID"], "")
                != row["ADDRESS"].lower().strip(),
                axis=1,
            )

            clients_with_new_address = clients[clients["ADDRESS_CHANGED"]]

            logger.debug(
                f"Skipping {len(clients) - len(clients_with_new_address)} clients already in database with same address ({len(clients_with_new_address)} new clients)"
            )

            return clients_with_new_address.copy()


def get_missing_asana_clients() -> pd.DataFrame:
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.execute(
                "SELECT id AS CLIENT_ID, firstName AS FIRSTNAME, lastName AS LASTNAME FROM emr_client WHERE asanaId IS NULL"
            )
            clients = cursor.fetchall()

            logger.debug(f"Found {len(clients)} clients missing Asana IDs")

            return pd.DataFrame(clients)


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
                client_id = get_column(client, "CLIENT_ID")
                if client_id is None:
                    logger.warning(
                        f"Skipping {client.FIRSTNAME} {client.LASTNAME} with no ID"
                    )
                    continue

                secondary_insurance = get_column(
                    client, "SECONDARY_INSURANCE_COMPANYNAME"
                )
                if (
                    isinstance(secondary_insurance, list)
                    and str(secondary_insurance) != "[nan]"
                ):
                    secondary_insurance = ",".join(secondary_insurance)

                firstname = get_column(client, "FIRSTNAME")
                lastname = get_column(client, "LASTNAME")
                preferred_name = get_column(client, "PREFERRED_NAME")

                full_name = ""
                if isinstance(firstname, str) and firstname:
                    full_name += firstname
                if isinstance(preferred_name, str) and preferred_name:
                    full_name += f" ({preferred_name})"
                if isinstance(lastname, str) and lastname:
                    full_name += f" {lastname}"

                added_date_data = get_column(client, "ADDED_DATE")
                added_date_formatted = None

                if isinstance(added_date_data, str) and added_date_data:
                    try:
                        added_date_formatted = datetime.strptime(
                            added_date_data, "%m/%d/%Y"
                        ).strftime("%Y-%m-%d")
                    except ValueError:
                        logger.warning(f"Could not parse date: {added_date_data}")

                dob_data = get_column(client, "DOB")
                dob_formatted = None

                if isinstance(dob_data, str) and dob_data:
                    try:
                        dob_formatted = datetime.strptime(
                            dob_data, "%m/%d/%Y"
                        ).strftime("%Y-%m-%d")
                    except ValueError:
                        logger.warning(f"Could not parse date: {dob_data}")

                gender_data = get_column(client, "GENDER")
                gender = None

                if isinstance(gender_data, str) and gender_data:
                    gender = gender_data.title().split(".")[-1]

                values = (
                    get_column(client, "CLIENT_ID"),
                    hashlib.sha256(str(client.CLIENT_ID).encode("utf-8")).hexdigest(),
                    get_column(client, "STATUS") != "Inactive",
                    get_column(client, "ASANA_ID"),
                    get_column(client, "ARCHIVED_IN_ASANA", default=False),
                    added_date_formatted,
                    dob_formatted,
                    firstname,
                    lastname,
                    preferred_name,
                    full_name.strip(),
                    get_column(client, "ADDRESS"),
                    get_column(client, "SCHOOL_DISTRICT"),
                    get_column(client, "CLOSEST_OFFICE")
                    if get_column(client, "CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "CLOSEST_OFFICE_MILES")
                    if get_column(client, "CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "SECOND_CLOSEST_OFFICE")
                    if get_column(client, "SECOND_CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "SECOND_CLOSEST_OFFICE_MILES")
                    if get_column(client, "SECOND_CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "THIRD_CLOSEST_OFFICE")
                    if get_column(client, "THIRD_CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "THIRD_CLOSEST_OFFICE_MILES")
                    if get_column(client, "THIRD_CLOSEST_OFFICE") != "Unknown"
                    else None,
                    get_column(client, "PRIMARY_INSURANCE_COMPANYNAME"),
                    secondary_insurance,
                    bool(get_column(client, "POLICY_PRIVATEPAY", default=False)),
                    get_column(client, "ASD_ADHD"),
                    get_column(client, "INTERPRETER", default=False),
                    gender,
                    f"{get_column(client, 'PHONE1'):.0f}"
                    if get_column(client, "PHONE1")
                    else None,
                )

                cursor.execute(sql, values)

        db_connection.commit()


def update_asana_information(clients_df: pd.DataFrame):
    logger.debug("Updating Asana information")
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = """
            UPDATE emr_client
            SET asanaId = %s, archivedInAsana = %s, asdAdhd = %s, interpreter = %s
            WHERE id = %s
            """

            for _, client in clients_df.iterrows():
                values = (
                    client.ASANA_ID if pd.notna(client.ASANA_ID) else None,
                    client.ARCHIVED_IN_ASANA,
                    client.ASD_ADHD if pd.notna(client.ASD_ADHD) else None,
                    client.INTERPRETER,
                    client.CLIENT_ID,
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
