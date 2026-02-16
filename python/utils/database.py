from __future__ import annotations

import hashlib
import inspect
import json
import os
from collections.abc import Callable
from contextlib import contextmanager
from datetime import date, datetime
from functools import wraps
from typing import Literal
from urllib.parse import urlparse

import pandas as pd
import pymysql.cursors
from dotenv import load_dotenv
from loguru import logger
from pymysql.connections import Connection
from pymysql.cursors import DictCursor

import utils.relationships
from utils.constants import (
    CLIENT_COLUMN_MAPPING,
    TABLE_APPOINTMENT,
    TABLE_BLOCKED_SCHOOL_DISTRICT,
    TABLE_BLOCKED_ZIP_CODE,
    TABLE_CLIENT,
    TABLE_CLIENT_EVAL,
    TABLE_EVALUATOR,
    TABLE_EVALUATORS_TO_INSURANCES,
    TABLE_INSURANCE,
    TABLE_INSURANCE_ALIAS,
    TABLE_PYTHON_CONFIG,
    TABLE_SCHOOL_DISTRICT,
)
from utils.misc import (
    format_date,
    format_gender,
    format_phone_number,
    get_boolean_value,
    get_column,
    get_full_name,
)

load_dotenv()


def get_db() -> Connection[DictCursor]:
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


def provide_connection(func: Callable) -> Callable:
    """Decorator to automatically provide a DB connection if not present."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        if kwargs.get("connection") is not None:
            return func(*args, **kwargs)

        # Check if connection is in positional args
        sig = inspect.signature(func)
        bound_args = sig.bind_partial(*args, **kwargs)
        if (
            "connection" in bound_args.arguments
            and bound_args.arguments["connection"] is not None
        ):
            return func(*args, **kwargs)

        with db_session() as new_conn:
            kwargs["connection"] = new_conn
            return func(*args, **kwargs)

    return wrapper


@contextmanager
def db_session():
    """Context manager for database connections."""
    connection = get_db()
    try:
        yield connection
    finally:
        connection.close()


def get_python_config(config_id: int = 2) -> dict:
    """Fetches python configuration from the database."""
    sql = f"SELECT data FROM {TABLE_PYTHON_CONFIG} WHERE id = %s"

    try:
        with db_session() as db_connection:
            with db_connection.cursor() as cursor:
                cursor.execute(sql, (config_id,))
                result = cursor.fetchone()

                if result and result["data"]:
                    data = result["data"]
                    if isinstance(data, str):
                        return json.loads(data)
                    return data
    except Exception as e:
        logger.error(f"Error fetching python config from DB: {e}")

    return {}


@provide_connection
def filter_clients_with_changed_address(
    clients: pd.DataFrame, connection: Connection[DictCursor]
) -> pd.DataFrame:
    """Identifies clients with new or changed addresses by comparing them to records in the database. Also, filters out clients with no address."""
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

    with connection.cursor() as cursor:
        cursor.execute(f"SELECT id, address FROM {TABLE_CLIENT}")
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


@provide_connection
def get_all_clients(connection: Connection[DictCursor]) -> pd.DataFrame:
    """Fetches all clients from the database that do not have an ID of 5 characters."""
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT * FROM {TABLE_CLIENT} WHERE LENGTH(id) != 5")
        clients_data = cursor.fetchall()

    df = pd.DataFrame(clients_data) if clients_data else pd.DataFrame()

    if not df.empty:
        df.rename(columns=CLIENT_COLUMN_MAPPING, inplace=True)
    return df


@provide_connection
def put_clients_in_db(clients_df: pd.DataFrame, connection: Connection[DictCursor]):
    """Inserts or updates client data in the database from a DataFrame."""
    logger.debug("Inserting clients into database")

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
            secondary_insurance = "|".join(
                str(item)
                for item in secondary_insurance
                if not (isinstance(item, float) and float("nan") == item)
            )

        firstname = get_column(client, "FIRSTNAME")
        lastname = get_column(client, "LASTNAME")
        preferred_name = get_column(client, "PREFERRED_NAME")

        full_name = get_full_name(firstname, lastname, preferred_name)

        added_date = get_column(client, "ADDED_DATE")
        added_date_formatted: str | None = None
        if isinstance(added_date, (str, date)):
            added_date_formatted = format_date(added_date)

        dob = get_column(client, "DOB")
        dob_formatted: str | None = "1900-01-01"
        if isinstance(dob, (str, date)):
            dob_formatted = format_date(dob)

        gender = format_gender(get_column(client, "GENDER"))
        phone_number = format_phone_number(get_column(client, "PHONE1"))
        email = get_column(client, "EMAIL")

        values = (
            client_id,
            hashlib.md5(str(client_id).encode("utf-8")).hexdigest(),
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
            if get_column(client, "LATITUDE") == "Unknown"
            else get_column(client, "LATITUDE"),
            None
            if get_column(client, "LONGITUDE") == "Unknown"
            else get_column(client, "LONGITUDE"),
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
            get_column(client, "LOGIN_NAME", default=None),
        )
        values_to_insert.append(values)

    sql = f"""
        INSERT INTO `{TABLE_CLIENT}` (id, hash, status, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, latitude, longitude, primaryInsurance, secondaryInsurance, precertExpires, privatePay, asdAdhd, interpreter, gender, phoneNumber, email, flag, taUser)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            latitude = CASE WHEN VALUES(latitude) IS NOT NULL THEN VALUES(latitude) ELSE latitude END,
            longitude = CASE WHEN VALUES(longitude) IS NOT NULL THEN VALUES(longitude) ELSE longitude END,
            primaryInsurance = VALUES(primaryInsurance),
            secondaryInsurance = VALUES(secondaryInsurance),
            precertExpires = VALUES(precertExpires),
            privatePay = VALUES(privatePay),
            asdAdhd = VALUES(asdAdhd),
            interpreter = VALUES(interpreter),
            gender = VALUES(gender),
            phoneNumber = VALUES(phoneNumber),
            email = VALUES(email),
            flag = VALUES(flag),
            taUser = VALUES(taUser);
    """

    with connection.cursor() as cursor:
        cursor.executemany(sql, values_to_insert)
    connection.commit()

    logger.info(f"Successfully inserted/updated {len(values_to_insert)} clients.")


@provide_connection
def update_client_ta_hashes(
    hashes_to_update: dict[str, str], connection: Connection[DictCursor]
) -> None:
    """Updates taHash for multiple clients in a single transaction."""
    if not hashes_to_update:
        return

    updates_for_executemany = [(v, k) for k, v in hashes_to_update.items()]
    sql = f"UPDATE {TABLE_CLIENT} SET taHash = %s WHERE id = %s"

    try:
        with connection.cursor() as cursor:
            try:
                cursor.executemany(sql, updates_for_executemany)
                connection.commit()
                logger.info(
                    f"Successfully updated taHash for {len(updates_for_executemany)} clients."
                )
            except Exception as e:
                logger.error(f"Failed to update taHashes: {e}")
                connection.rollback()

    except Exception as e:
        logger.error(f"Failed to update taHashes: {e}")
        connection.rollback()


@provide_connection
def put_appointment_in_db(
    appointment_id: str,
    client_id: int,
    evaluator_npi: int,
    start_time: datetime,
    end_time: datetime,
    connection: Connection[DictCursor],
    da_eval: Literal["EVAL", "DA", "DAEVAL"] | None = None,
    asd_adhd: Literal["ASD", "ADHD", "ASD+ADHD", "ASD+LD", "ADHD+LD", "LD"]
    | None = None,
    cancelled: bool | None = False,
    location: str | None = None,
    gcal_event_id: str | None = None,
):
    """Inserts an appointment into the database."""
    sql = f"""
        INSERT INTO `{TABLE_APPOINTMENT}` (id, clientId, evaluatorNpi, startTime, endTime, daEval, asdAdhd, cancelled, locationKey, calendarEventId)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            clientId = VALUES(clientId),
            evaluatorNpi = VALUES(evaluatorNpi),
            startTime = VALUES(startTime),
            endTime = VALUES(endTime),
            daEval = CASE WHEN VALUES(daEval) IS NOT NULL THEN VALUES(daEval) ELSE daEval END,
            asdAdhd = CASE WHEN VALUES(asdAdhd) IS NOT NULL THEN VALUES(asdAdhd) ELSE asdAdhd END,
            cancelled = VALUES(cancelled),
            locationKey = CASE WHEN VALUES(locationKey) IS NOT NULL THEN VALUES(locationKey) ELSE locationKey END,
            calendarEventId = CASE WHEN VALUES(calendarEventId) IS NOT NULL THEN VALUES(calendarEventId) ELSE calendarEventId END;
    """
    params = (
        appointment_id,
        client_id,
        evaluator_npi,
        start_time,
        end_time,
        da_eval,
        asd_adhd,
        cancelled,
        location,
        gcal_event_id,
    )

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        connection.commit()


@provide_connection
def get_evaluators_with_blocked_locations(
    connection: Connection[DictCursor],
):
    """Fetches evaluators from the database, including their blocked zip codes and school districts."""
    evaluators: dict[int, dict] = {}

    try:
        with connection.cursor() as cursor:
            sql_evaluators = f"SELECT * FROM {TABLE_EVALUATOR}"
            cursor.execute(sql_evaluators)
            for row in cursor.fetchall():
                npi = row["npi"]
                evaluators[npi] = {
                    **row,
                    "blockedSchoolDistricts": [],
                    "blockedZipCodes": [],
                }

            sql_blocked_districts = f"""
                SELECT
                    bsd.evaluatorNpi,
                    sd.fullName AS schoolDistrictName
                FROM
                    {TABLE_BLOCKED_SCHOOL_DISTRICT} AS bsd
                JOIN
                    {TABLE_SCHOOL_DISTRICT} AS sd
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

            sql_blocked_zips = (
                f"SELECT evaluatorNpi, zipCode FROM {TABLE_BLOCKED_ZIP_CODE}"
            )
            cursor.execute(sql_blocked_zips)
            for row in cursor.fetchall():
                npi = row["evaluatorNpi"]
                if npi in evaluators:
                    evaluators[npi]["blockedZipCodes"].append(row["zipCode"])

            sql_insurances = f"""
                SELECT
                    eti.evaluatorNpi,
                    i.shortName
                FROM
                    {TABLE_EVALUATORS_TO_INSURANCES} AS eti
                JOIN
                    {TABLE_INSURANCE} AS i
                ON
                    eti.insuranceId = i.id
            """
            cursor.execute(sql_insurances)
            for row in cursor.fetchall():
                npi = row["evaluatorNpi"]
                if npi in evaluators:
                    evaluators[npi][row["shortName"]] = True
    except Exception as e:
        logger.error(f"Database error while fetching evaluators: {e}")
        return {}

    return evaluators


@provide_connection
def _get_existing_client_eval_links(
    connection: Connection[DictCursor],
) -> dict[str, set[str]]:
    """Gets all existing client-evaluator relationships from the database."""
    existing_links: dict[str, set[str]] = {}

    with connection.cursor() as cursor:
        sql = f"SELECT clientId, evaluatorNpi FROM {TABLE_CLIENT_EVAL}"
        try:
            cursor.execute(sql)
            results = cursor.fetchall()
            for row in results:
                client_id_str = str(row["clientId"])
                evaluator_npi_str = str(row["evaluatorNpi"])
                if client_id_str not in existing_links:
                    existing_links[client_id_str] = set()
                existing_links[client_id_str].add(evaluator_npi_str)
            logger.debug(
                f"Found {len(results)} existing client-evaluator relationships"
            )
        except Exception as e:
            logger.error(f"Failed to fetch existing relationships: {e}")

    return existing_links


@provide_connection
def _delete_client_eval_links(
    client_id: str,
    evaluator_npis: set[str],
    connection: Connection[DictCursor],
) -> None:
    """Deletes specific client-evaluator relationships from the database."""
    if not evaluator_npis:
        return

    placeholders = ",".join(["%s"] * len(evaluator_npis))
    sql = f"DELETE FROM {TABLE_CLIENT_EVAL} WHERE clientId = %s AND evaluatorNpi IN ({placeholders})"
    params = [client_id] + list(evaluator_npis)

    with connection.cursor() as cursor:
        try:
            cursor.execute(sql, params)
            connection.commit()
            logger.debug(
                f"Deleted {len(evaluator_npis)} relationships for client {client_id}"
            )
        except Exception as e:
            logger.error(f"Failed to delete relationships for client {client_id}: {e}")
            connection.rollback()


@provide_connection
def _insert_client_eval_links(
    client_id: str,
    evaluator_npis: set[str],
    connection: Connection[DictCursor],
) -> None:
    """Inserts specific client-evaluator relationships."""
    if not evaluator_npis:
        return

    for npi in evaluator_npis:
        _link_client_provider(client_id, npi, connection=connection)


@provide_connection
def _delete_all_relationships_for_clients(
    client_ids: set[str], connection: Connection[DictCursor]
) -> None:
    """Deletes all relationships for specific clients."""
    if not client_ids:
        return

    placeholders = ",".join(["%s"] * len(client_ids))
    sql = f"DELETE FROM {TABLE_CLIENT_EVAL} WHERE clientId IN ({placeholders})"
    params = list(client_ids)

    with connection.cursor() as cursor:
        try:
            cursor.execute(sql, params)
            deleted_count = cursor.rowcount
            connection.commit()
            logger.debug(
                f"Deleted {deleted_count} existing relationships for {len(client_ids)} clients"
            )
        except Exception as e:
            logger.error(f"Failed to delete relationships for clients: {e}")
            connection.rollback()


@provide_connection
def _link_client_provider(
    client_id: str, npi: str, connection: Connection[DictCursor]
) -> None:
    """Inserts a client-provider link into the database."""
    sql = f"""
    INSERT INTO {TABLE_CLIENT_EVAL} (clientId, evaluatorNpi)
    VALUES (%s, %s)
    ON DUPLICATE KEY UPDATE
        clientId = VALUES(clientId),
        evaluatorNpi = VALUES(evaluatorNpi)
    """
    params = (client_id, npi)

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        connection.commit()


@provide_connection
def insert_by_matching_criteria_incremental(
    clients: pd.DataFrame,
    evaluators: dict,
    connection: Connection[DictCursor],
) -> None:
    """Inserts client-provider links based on matching criteria using incremental updates."""
    logger.debug("Starting incremental client-evaluator matching...")

    existing_links = _get_existing_client_eval_links(connection=connection)
    insurance_mappings = get_insurance_mappings(connection=connection)

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

        eligible_evaluators_by_district = utils.relationships.match_by_school_district(
            client, evaluators
        )
        eligible_evaluators_by_insurance = utils.relationships.match_by_insurance(
            client, evaluators, insurance_mappings
        )
        current_should_be = set(
            set(eligible_evaluators_by_district) & set(eligible_evaluators_by_insurance)
        )
        current_should_be = {str(npi) for npi in current_should_be}
        current_exists = existing_links.get(client_id, set())

        to_add = current_should_be - current_exists
        to_remove = current_exists - current_should_be

        if to_add or to_remove:
            updated_count += 1
            if to_remove:
                _delete_client_eval_links(client_id, to_remove, connection=connection)
            if to_add:
                _insert_client_eval_links(client_id, to_add, connection=connection)
            existing_links[client_id] = current_should_be

    logger.info(
        f"Completed incremental matching: {processed_count} clients processed, {updated_count} clients updated"
    )


@provide_connection
def insert_by_matching_criteria_client_specific(
    clients: pd.DataFrame,
    evaluators: dict,
    specific_client_ids: set[str],
    connection: Connection[DictCursor],
) -> None:
    """Updates client-evaluator relationships for specific clients only."""
    logger.debug(
        f"Starting client-specific matching for {len(specific_client_ids)} clients..."
    )

    specific_client_ids = {str(id).strip() for id in specific_client_ids}
    clients_to_process = clients[
        clients["CLIENT_ID"].astype(str).isin(specific_client_ids)
    ]

    _delete_all_relationships_for_clients(specific_client_ids, connection=connection)
    insurance_mappings = get_insurance_mappings(connection=connection)

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
            client, evaluators, insurance_mappings
        )
        matched_evaluator_npis = list(
            set(eligible_evaluators_by_district) & set(eligible_evaluators_by_insurance)
        )

        for npi in matched_evaluator_npis:
            _link_client_provider(client_id, npi, connection=connection)

        updated_count += 1
        full_name = (
            f"{client.get('FIRSTNAME', '')} {client.get('LASTNAME', '')}".strip()
        )
        logger.debug(
            f"Updated relationships for {full_name} (ID: {client_id}): {len(matched_evaluator_npis)} matches"
        )

    logger.info(f"Completed client-specific matching: {updated_count} clients updated")


def insert_by_matching_criteria(
    clients: pd.DataFrame,
    evaluators: dict,
    connection: Connection[DictCursor],
    force_client_ids: set[str] | None = None,
) -> None:
    """Enhanced client-evaluator matching with options for full or partial updates."""
    if force_client_ids:
        logger.info(
            f"Force-updating relationships for {len(force_client_ids)} specific clients"
        )
        insert_by_matching_criteria_client_specific(
            clients, evaluators, force_client_ids, connection=connection
        )
    else:
        logger.info("Running incremental update for all clients")
        insert_by_matching_criteria_incremental(
            clients, evaluators, connection=connection
        )


@provide_connection
def get_insurance_mappings(
    connection: Connection[DictCursor],
) -> dict[str, str]:
    """Fetches insurance aliases and their canonical short names from the database."""
    mappings: dict[str, str] = {}

    with connection.cursor() as cursor:
        sql_short = f"SELECT shortName FROM {TABLE_INSURANCE}"
        cursor.execute(sql_short)
        for row in cursor.fetchall():
            mappings[row["shortName"]] = row["shortName"]

        sql_aliases = f"""
            SELECT
                ia.name AS alias,
                i.shortName
            FROM
                {TABLE_INSURANCE_ALIAS} AS ia
            JOIN
                {TABLE_INSURANCE} AS i
            ON
                ia.insuranceId = i.id
        """
        cursor.execute(sql_aliases)
        for row in cursor.fetchall():
            mappings[row["alias"]] = row["shortName"]

    return mappings


@provide_connection
def get_all_evaluators_npi_map(
    connection: Connection[DictCursor],
) -> dict[str, int]:
    """Gets a map of email (str) to NPI (int) for all evaluators."""
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT npi, email FROM {TABLE_EVALUATOR}")
        results = cursor.fetchall()
        return {row["email"]: row["npi"] for row in results}


@provide_connection
def get_npi_to_name_map(
    connection: Connection[DictCursor],
) -> dict[int, str]:
    """Returns a dictionary mapping NPI (int) to Evaluator Name (str)."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT npi, providerName FROM {TABLE_EVALUATOR}")
            results = cursor.fetchall()
            return {row["npi"]: row["providerName"] for row in results}
    except Exception:
        logger.exception("Error fetching NPI to Name map")
        return {}
