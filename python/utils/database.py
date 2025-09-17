import hashlib
import os
from datetime import datetime
from urllib.parse import urlparse

import pandas as pd
import pymysql.cursors
from dotenv import load_dotenv
from loguru import logger

import utils.relationships
from utils.misc import (
    format_date,
    format_gender,
    format_phone_number,
    get_boolean_value,
    get_column,
    get_full_name,
)

load_dotenv()


def open_local_spreadsheet(file) -> pd.DataFrame:
    """Reads a CSV file and returns a DataFrame."""
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
    """Returns a connection to the database."""
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


def sync_client_statuses(clients_df: pd.DataFrame):
    """Updates the status for all clients in the DataFrame.

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
    """Identifies clients with new or changed addresses by comparing them to records in the database. Also, filters out clients with no address.

    Args:
      clients (pd.DataFrame): A DataFrame of client data from TA.

    Returns:
        pd.DataFrame: A DataFrame of clients with new or changed addresses.
    """
    initial_count = len(clients)
    clients_with_address = clients.dropna(subset=["ADDRESS"])
    clients_with_address = clients_with_address[
        clients_with_address["ADDRESS"].str.strip() != ""
    ]
    no_address_count = initial_count - len(clients_with_address)
    if no_address_count > 0:
        logger.debug(f"Skipping {no_address_count} clients with no address.")

    if clients_with_address.empty:
        logger.debug("No clients with an address to process.")
        return clients_with_address

    db_connection = get_db()
    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT id, address FROM emr_client")
            db_addresses = pd.DataFrame(cursor.fetchall())

    if db_addresses.empty:
        logger.debug(
            "No existing clients found in the database. All clients will be geocoded."
        )
        return clients_with_address.copy()

    db_addresses.rename(
        columns={"id": "CLIENT_ID", "address": "DB_ADDRESS"}, inplace=True
    )
    db_addresses["CLIENT_ID"] = db_addresses["CLIENT_ID"].astype(str)

    clients_with_address["CLIENT_ID"] = clients_with_address["CLIENT_ID"].astype(str)
    clients_with_address["NORMALIZED_ADDRESS"] = (
        clients_with_address["ADDRESS"].fillna("").str.lower().str.strip()
    )
    db_addresses["NORMALIZED_ADDRESS"] = (
        db_addresses["DB_ADDRESS"].fillna("").str.lower().str.strip()
    )

    merged_df = pd.merge(
        clients_with_address,
        db_addresses,
        on="CLIENT_ID",
        how="left",
        suffixes=("_new", "_db"),
    )

    changed_mask = (
        merged_df["NORMALIZED_ADDRESS_new"] != merged_df["NORMALIZED_ADDRESS_db"]
    ) | merged_df["NORMALIZED_ADDRESS_db"].isnull()

    changed_clients = merged_df[changed_mask]

    logger.debug(
        f"Skipping {len(clients_with_address) - len(changed_clients)} clients with same address "
        f"({len(changed_clients)} clients with new/changed addresses)."
    )

    return clients_with_address[
        clients_with_address["CLIENT_ID"].isin(changed_clients["CLIENT_ID"])
    ].copy()


def get_all_clients() -> pd.DataFrame:
    """Fetches all clients from the database.

    Returns:
        pd.DataFrame: A DataFrame containing all client records.
    """
    db_connection = get_db()
    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT * FROM emr_client")
            clients = cursor.fetchall()
            df = pd.DataFrame(clients)

    column_mapping = {
        "id": "CLIENT_ID",
        "hash": "HASH",
        "status": "STATUS",
        "asanaId": "ASANA_ID",
        "archivedInAsana": "ARCHIVED_IN_ASANA",
        "addedDate": "ADDED_DATE",
        "dob": "DOB",
        "firstName": "FIRSTNAME",
        "lastName": "LASTNAME",
        "preferredName": "PREFERRED_NAME",
        "fullName": "FULL_NAME",
        "address": "ADDRESS",
        "schoolDistrict": "SCHOOL_DISTRICT",
        "closestOffice": "CLOSEST_OFFICE",
        "closestOfficeMiles": "CLOSEST_OFFICE_MILES",
        "secondClosestOffice": "SECOND_CLOSEST_OFFICE",
        "secondClosestOfficeMiles": "SECOND_CLOSEST_OFFICE_MILES",
        "thirdClosestOffice": "THIRD_CLOSEST_OFFICE",
        "thirdClosestOfficeMiles": "THIRD_CLOSEST_OFFICE_MILES",
        "primaryInsurance": "INSURANCE_COMPANYNAME",
        "secondaryInsurance": "SECONDARY_INSURANCE_COMPANYNAME",
        "privatePay": "POLICY_PRIVATEPAY",
        "asdAdhd": "ASD_ADHD",
        "interpreter": "INTERPRETER",
        "phoneNumber": "PHONE1",
        "gender": "GENDER",
        "highPriority": "HIGH_PRIORITY",
        "color": "COLOR",
    }

    df.rename(columns=column_mapping, inplace=True)
    return df


def put_clients_in_db(clients_df):
    """Inserts or updates client data in the database from a DataFrame."""
    logger.debug("Inserting clients into database")
    db_connection = get_db()

    values_to_insert = []

    for _, client in clients_df.iterrows():
        client_id = get_column(client, "CLIENT_ID")
        if client_id is None:
            logger.warning(
                f"Skipping {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')} with no ID"
            )
            continue

        secondary_insurance = get_column(client, "SECONDARY_INSURANCE_COMPANYNAME")
        if isinstance(secondary_insurance, list):
            secondary_insurance = ",".join(
                str(item)
                for item in secondary_insurance
                if not (isinstance(item, float) and float("nan") == item)
            )

        firstname = get_column(client, "FIRSTNAME")
        lastname = get_column(client, "LASTNAME")
        preferred_name = get_column(client, "PREFERRED_NAME")

        full_name = get_full_name(firstname, lastname, preferred_name)
        added_date_formatted = format_date(get_column(client, "ADDED_DATE"))
        dob_formatted = format_date(get_column(client, "DOB")) or "1900-01-01"
        gender = format_gender(get_column(client, "GENDER"))
        phone_number = format_phone_number(get_column(client, "PHONE1"))
        email = get_column(client, "EMAIL")

        values = (
            client_id,
            hashlib.sha256(str(client_id).encode("utf-8")).hexdigest(),
            get_column(client, "STATUS") != "Inactive",
            added_date_formatted,
            dob_formatted,
            firstname,
            lastname,
            preferred_name,
            full_name,
            get_column(client, "ADDRESS"),
            get_column(client, "SCHOOL_DISTRICT"),
            None
            if get_column(client, "CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "CLOSEST_OFFICE"),
            None
            if get_column(client, "CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "CLOSEST_OFFICE_MILES"),
            None
            if get_column(client, "SECOND_CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "SECOND_CLOSEST_OFFICE"),
            None
            if get_column(client, "SECOND_CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "SECOND_CLOSEST_OFFICE_MILES"),
            None
            if get_column(client, "THIRD_CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "THIRD_CLOSEST_OFFICE"),
            None
            if get_column(client, "THIRD_CLOSEST_OFFICE") == "Unknown"
            else get_column(client, "THIRD_CLOSEST_OFFICE_MILES"),
            get_column(client, "PRIMARY_INSURANCE_COMPANYNAME"),
            secondary_insurance,
            get_column(client, "PRECERT_EXPIREDATE"),
            get_boolean_value(client, "POLICY_PRIVATEPAY"),
            get_column(client, "ASD_ADHD"),
            get_column(client, "INTERPRETER", default=False),
            gender,
            phone_number,
            email,
        )
        values_to_insert.append(values)

    sql = """
        INSERT INTO `emr_client` (id, hash, status, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, closestOffice, closestOfficeMiles, secondClosestOffice, secondClosestOfficeMiles, thirdClosestOffice, thirdClosestOfficeMiles, primaryInsurance, secondaryInsurance, precertExpires, privatePay, asdAdhd, interpreter, gender, phoneNumber, email)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            hash = VALUES(hash),
            status = VALUES(status),
            addedDate = VALUES(addedDate),
            dob = VALUES(dob),
            firstName = VALUES(firstName),
            lastName = VALUES(lastName),
            preferredName = VALUES(preferredName),
            fullName = VALUES(fullName),
            address = VALUES(address),
            schoolDistrict = CASE WHEN VALUES(schoolDistrict) IS NOT NULL AND VALUES(schoolDistrict) != 'Unknown' THEN VALUES(schoolDistrict) ELSE schoolDistrict END,
            closestOffice = CASE WHEN VALUES(closestOffice) IS NOT NULL AND VALUES(closestOffice) != 'Unknown' THEN VALUES(closestOffice) ELSE closestOffice END,
            closestOfficeMiles = CASE WHEN VALUES(closestOfficeMiles) IS NOT NULL THEN VALUES(closestOfficeMiles) ELSE closestOfficeMiles END,
            secondClosestOffice = CASE WHEN VALUES(secondClosestOffice) IS NOT NULL AND VALUES(secondClosestOffice) != 'Unknown' THEN VALUES(secondClosestOffice) ELSE secondClosestOffice END,
            secondClosestOfficeMiles = CASE WHEN VALUES(secondClosestOfficeMiles) IS NOT NULL THEN VALUES(secondClosestOfficeMiles) ELSE secondClosestOfficeMiles END,
            thirdClosestOffice = CASE WHEN VALUES(thirdClosestOffice) IS NOT NULL AND VALUES(thirdClosestOffice) != 'Unknown' THEN VALUES(thirdClosestOffice) ELSE thirdClosestOffice END,
            thirdClosestOfficeMiles = CASE WHEN VALUES(thirdClosestOfficeMiles) IS NOT NULL THEN VALUES(thirdClosestOfficeMiles) ELSE thirdClosestOfficeMiles END,
            primaryInsurance = VALUES(primaryInsurance),
            secondaryInsurance = VALUES(secondaryInsurance),
            precertExpires = VALUES(precertExpires),
            privatePay = VALUES(privatePay),
            asdAdhd = VALUES(asdAdhd),
            interpreter = VALUES(interpreter),
            gender = VALUES(gender),
            phoneNumber = VALUES(phoneNumber),
            email = VALUES(email);
    """

    with db_connection:
        with db_connection.cursor() as cursor:
            cursor.executemany(sql, values_to_insert)
        db_connection.commit()

    logger.info(f"Successfully inserted/updated {len(values_to_insert)} clients.")


def get_evaluators_with_blocked_locations():
    """Fetches evaluators from the database, including their blocked zip codes and school districts.

    Returns:
        dict: A dictionary of evaluators, keyed by NPI, with their details
              and lists of blocked school districts and zip codes.
    """
    db_connection = get_db()
    evaluators = {}

    try:
        with db_connection.cursor() as cursor:
            sql_evaluators = "SELECT * FROM emr_evaluator"
            cursor.execute(sql_evaluators)
            for row in cursor.fetchall():
                npi = row["npi"]
                evaluators[npi] = {
                    **row,
                    "blockedSchoolDistricts": [],
                    "blockedZipCodes": [],
                }

            sql_blocked_districts = """
                SELECT
                    bsd.evaluatorNpi,
                    sd.fullName AS schoolDistrictName
                FROM
                    emr_blocked_school_district AS bsd
                JOIN
                    emr_school_district AS sd
                ON
                    bsd.schoolDistrictId = sd.id
            """
            cursor.execute(sql_blocked_districts)
            for row in cursor.fetchall():
                npi = row["evaluatorNpi"]
                if npi in evaluators:
                    evaluators[npi]["blockedSchoolDistricts"].append(
                        row["schoolDistrictName"]
                    )

            sql_blocked_zips = "SELECT evaluatorNpi, zipCode FROM emr_blocked_zip_code"
            cursor.execute(sql_blocked_zips)
            for row in cursor.fetchall():
                npi = row["evaluatorNpi"]
                if npi in evaluators:
                    evaluators[npi]["blockedZipCodes"].append(row["zipCode"])

    except Exception as e:
        logger.error(f"Database error while fetching evaluators: {e}")
        return {}
    finally:
        db_connection.close()

    return evaluators


def link_client_provider(client_id: str, npi: str) -> None:
    """Inserts a client-provider link into the database."""
    # logger.debug(
    #     f"Inserting client-provider link into database for {client_id} and {npi}",
    # )
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


def delete_all_client_eval_links():
    """Deletes all existing client-evaluator relationships."""
    logger.debug(
        "Deleting all existing client-evaluator relationships from the database."
    )
    db_connection = get_db()

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = "DELETE FROM emr_client_eval"
            try:
                cursor.execute(sql)
                db_connection.commit()
                logger.debug("Successfully deleted all existing matches.")
            except Exception as e:
                logger.error(f"Failed to delete all existing matches: {e}")
                db_connection.rollback()


def insert_by_matching_criteria(clients: pd.DataFrame, evaluators: dict):
    """Inserts client-provider links based on matching criteria."""
    delete_all_client_eval_links()
    logger.debug("Starting to match clients with evaluators...")

    processed_count = 0
    report_interval = 100

    for _, client in clients.iterrows():
        client_id_raw = get_column(client, "CLIENT_ID")
        client_id = str(client_id_raw)
        if not client_id or client_id == "nan" or client_id == "None":
            # This should never be possible, but for type safety, we'll check for it anyway
            logger.warning(
                f"Skipping client with invalid ID: {client.get('FIRSTNAME')} {client.get('LASTNAME')}"
            )
            continue

        processed_count += 1

        if processed_count % report_interval == 0:
            logger.info(f"Matched {processed_count} clients...")

        eligible_evaluators_by_district = utils.relationships.match_by_school_district(
            client, evaluators
        )
        eligible_evaluators_by_insurance = utils.relationships.match_by_insurance(
            client, evaluators
        )

        matched_evaluator_npis = list(
            set(eligible_evaluators_by_district) & set(eligible_evaluators_by_insurance)
        )

        for npi in matched_evaluator_npis:
            link_client_provider(client_id, npi)
