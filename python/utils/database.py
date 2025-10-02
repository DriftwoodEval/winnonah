import hashlib
import os
from typing import Dict, Optional, Set
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
            get_column(client, "FLAG"),
        )
        values_to_insert.append(values)

    sql = """
        INSERT INTO `emr_client` (id, hash, status, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, closestOffice, closestOfficeMiles, secondClosestOffice, secondClosestOfficeMiles, thirdClosestOffice, thirdClosestOfficeMiles, primaryInsurance, secondaryInsurance, precertExpires, privatePay, asdAdhd, interpreter, gender, phoneNumber, email, flag)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            email = VALUES(email),
            flag = VALUES(flag);
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


def get_existing_client_eval_links() -> Dict[str, Set[str]]:
    """Gets all existing client-evaluator relationships from the database.

    Returns:
        Dict mapping client_id -> set of evaluator NPIs
    """
    db_connection = get_db()
    existing_links = {}

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = "SELECT clientId, evaluatorNpi FROM emr_client_eval"
            try:
                cursor.execute(sql)
                results = cursor.fetchall()

                # Iterate over each dictionary (row) in the results
                for row in results:
                    client_id = row["clientId"]
                    evaluator_npi = row["evaluatorNpi"]

                    client_id_str = str(client_id)
                    evaluator_npi_str = str(evaluator_npi)

                    if client_id_str not in existing_links:
                        existing_links[client_id_str] = set()
                    existing_links[client_id_str].add(evaluator_npi_str)

                logger.debug(
                    f"Found {len(results)} existing client-evaluator relationships"
                )
            except Exception as e:
                logger.error(f"Failed to fetch existing relationships: {e}")

    return existing_links


def delete_client_eval_links(client_id: str, evaluator_npis: Set[str]) -> None:
    """Deletes specific client-evaluator relationships from the database.

    Args:
        client_id (str): The client ID
        evaluator_npis (Set[str]): Set of evaluator NPIs ro remove for this client
    """
    if not evaluator_npis:
        return

    db_connection = get_db()
    with db_connection:
        with db_connection.cursor() as cursor:
            # Create placeholders for the IN clause
            placeholders = ",".join(["%s"] * len(evaluator_npis))
            sql = f"DELETE FROM emr_client_eval WHERE clientId = %s AND evaluatorNpi IN ({placeholders})"

            try:
                cursor.execute(sql, [client_id] + list(evaluator_npis))
                db_connection.commit()
                logger.debug(
                    f"Deleted {len(evaluator_npis)} relationships for client {client_id}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to delete relationships for client {client_id}: {e}"
                )
                db_connection.rollback()


def insert_client_eval_links(client_id: str, evaluator_npis: Set[str]) -> None:
    """Inserts specific client-evaluator relationships.

    Args:
        client_id: The client ID
        evaluator_npis: Set of evaluator NPIs to add for this client
    """
    if not evaluator_npis:
        return

    for npi in evaluator_npis:
        link_client_provider(client_id, npi)


def delete_all_relationships_for_clients(client_ids: Set[str]) -> None:
    """Deletes all relationships for specific clients.

    Args:
        client_ids: Set of client IDs to clear all relationships for
    """
    if not client_ids:
        return

    db_connection = get_db()
    with db_connection:
        with db_connection.cursor() as cursor:
            placeholders = ",".join(["%s"] * len(client_ids))
            sql = f"DELETE FROM emr_client_eval WHERE clientId IN ({placeholders})"

            try:
                cursor.execute(sql, list(client_ids))
                deleted_count = cursor.rowcount
                db_connection.commit()
                logger.debug(
                    f"Deleted {deleted_count} existing relationships for {len(client_ids)} clients"
                )
            except Exception as e:
                logger.error(f"Failed to delete relationships for clients: {e}")
                db_connection.rollback()


def link_client_provider(client_id: str, npi: str) -> None:
    """Inserts a client-provider link into the database."""
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


def insert_by_matching_criteria_incremental(
    clients: pd.DataFrame, evaluators: dict
) -> None:
    """Inserts client-provider links based on matching criteria using incremental updates.

    1. Gets existing relationships from database
    2. Calculates what the relationships should be for each client
    3. Only updates relationships that have actually changed
    """
    logger.debug("Starting incremental client-evaluator matching...")

    existing_links = get_existing_client_eval_links()

    processed_count = 0
    updated_count = 0
    report_interval = 500

    for _, client in clients.iterrows():
        client_id_raw = get_column(client, "CLIENT_ID")
        client_id = str(client_id_raw)

        if not client_id or client_id == "nan" or client_id == "None":
            logger.warning(
                f"Skipping client with invalid ID: {client.get('FIRSTNAME')} {client.get('LASTNAME')}"
            )
            continue

        processed_count += 1
        if processed_count % report_interval == 0:
            logger.info(
                f"Processed {processed_count} clients, updated {updated_count}..."
            )

        # Calculate what the relationships should be
        eligible_evaluators_by_district = utils.relationships.match_by_school_district(
            client, evaluators
        )
        eligible_evaluators_by_insurance = utils.relationships.match_by_insurance(
            client, evaluators
        )
        current_should_be = set(
            set(eligible_evaluators_by_district) & set(eligible_evaluators_by_insurance)
        )

        # Convert to strings for consistency
        current_should_be = {str(npi) for npi in current_should_be}

        current_exists = existing_links.get(client_id, set())

        # Calculate differences
        # print(client_id, current_should_be, current_exists)
        to_add = current_should_be - current_exists
        to_remove = current_exists - current_should_be

        # Only update if there are changes
        if to_add or to_remove:
            updated_count += 1

            if to_remove:
                # logger.debug(
                #     f"Client {client_id}: Removing {len(to_remove)} relationships"
                # )
                delete_client_eval_links(client_id, to_remove)

            if to_add:
                # logger.debug(f"Client {client_id}: Adding {len(to_add)} relationships")
                insert_client_eval_links(client_id, to_add)

            # Update our tracking
            existing_links[client_id] = current_should_be

    logger.info(
        f"Completed incremental matching: {processed_count} clients processed, {updated_count} clients updated"
    )


def insert_by_matching_criteria_client_specific(
    clients: pd.DataFrame, evaluators: dict, specific_client_ids: Set[str]
) -> None:
    """Updates client-evaluator relationships for specific clients only.

    This is useful when you want to force-update specific clients without
    affecting all other relationships.

    Args:
        clients: All clients DataFrame
        evaluators: Evaluators dictionary
        specific_client_ids: Set of client IDs to update
    """
    logger.debug(
        f"Starting client-specific matching for {len(specific_client_ids)} clients..."
    )

    specific_client_ids = {str(id).strip() for id in specific_client_ids}

    clients_to_process = clients[
        clients["CLIENT_ID"].astype(str).isin(specific_client_ids)
    ]

    delete_all_relationships_for_clients(specific_client_ids)

    updated_count = 0

    for _, client in clients_to_process.iterrows():
        client_id_raw = get_column(client, "CLIENT_ID")
        client_id = str(client_id_raw)

        if not client_id or client_id == "nan" or client_id == "None":
            continue

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

        updated_count += 1
        full_name = (
            f"{client.get('FIRSTNAME', '')} {client.get('LASTNAME', '')}".strip()
        )
        logger.debug(
            f"Updated relationships for {full_name} (ID: {client_id}): {len(matched_evaluator_npis)} matches"
        )

    logger.info(f"Completed client-specific matching: {updated_count} clients updated")


def insert_by_matching_criteria(
    clients: pd.DataFrame, evaluators: dict, force_client_ids: Optional[Set[str]] = None
) -> None:
    """Enhanced client-evaluator matching with options for full or partial updates.

    Args:
        clients: All clients DataFrame
        evaluators: Evaluators dictionary
        force_client_ids: If provided, only these clients will be updated.
                         If None, all clients are processed incrementally.
    """
    if force_client_ids:
        # Update only specific clients (delete and recreate their relationships)
        logger.info(
            f"Force-updating relationships for {len(force_client_ids)} specific clients"
        )
        insert_by_matching_criteria_client_specific(
            clients, evaluators, force_client_ids
        )
    else:
        # Update all clients incrementally (only change what's different)
        logger.info("Running incremental update for all clients")
        insert_by_matching_criteria_incremental(clients, evaluators)
