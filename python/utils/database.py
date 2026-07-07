from __future__ import annotations

import hashlib
import inspect
import json
import os
from collections.abc import Callable
from contextlib import contextmanager
from datetime import date, datetime
from functools import wraps
from typing import Literal, cast
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
    TABLE_ASSESSMENT_TYPE,
    TABLE_BLOCKED_SCHOOL_DISTRICT,
    TABLE_BLOCKED_ZIP_CODE,
    TABLE_CLIENT,
    TABLE_CLIENT_EVAL,
    TABLE_CLIENT_INSURANCE_POLICY,
    TABLE_EVALUATOR,
    TABLE_EVALUATORS_TO_INSURANCES,
    TABLE_FAILURE,
    TABLE_IN_PERSON_ASSESSMENT,
    TABLE_IN_PERSON_ASSESSMENT_HISTORY,
    TABLE_INSURANCE,
    TABLE_INSURANCE_ALIAS,
    TABLE_INSURANCE_REVIEW,
    TABLE_INSURANCE_REVIEW_HISTORY,
    TABLE_NOTE,
    TABLE_NOTE_HISTORY,
    TABLE_PYTHON_CONFIG,
    TABLE_QUESTIONNAIRE,
    TABLE_QUESTIONNAIRE_RULE,
    TABLE_SCHOOL_DISTRICT,
    TABLE_USER,
    TEST_NAMES_LOWER,
)
from utils.misc import (
    format_date,
    format_gender,
    format_phone_number,
    get_column,
    get_full_name,
)

load_dotenv()


def get_db() -> Connection[DictCursor]:
    """Returns a connection to the database."""
    db_url = urlparse(os.getenv("DATABASE_URL", ""))
    return pymysql.connect(
        host=db_url.hostname,
        port=db_url.port or 3306,
        user=db_url.username,
        password=db_url.password or "",
        database=db_url.path[1:],
        cursorclass=pymysql.cursors.DictCursor,
    )


def provide_connection(func: Callable) -> Callable:
    """Decorator to automatically provide a DB connection if not present."""

    if inspect.iscoroutinefunction(func):

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            if kwargs.get("connection") is not None:
                return await func(*args, **kwargs)

            # Check if connection is in positional args
            sig = inspect.signature(func)
            bound_args = sig.bind_partial(*args, **kwargs)
            if (
                "connection" in bound_args.arguments
                and bound_args.arguments["connection"] is not None
            ):
                return await func(*args, **kwargs)

            with db_session() as new_conn:
                kwargs["connection"] = new_conn
                return await func(*args, **kwargs)

        return async_wrapper

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
        with db_session() as db_connection, db_connection.cursor() as cursor:
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


def get_services_config() -> dict:
    """Fetches the services credentials config (config_id=1) from the database."""
    full_config = get_python_config(config_id=1)
    return full_config.get("services", {})


_REFERRAL_FAX_DATE_ID = 3
_SYNC_REPORT_DATE_ID = 4


def _get_date_cache(config_id: int) -> date | None:
    data = get_python_config(config_id)
    date_str = data.get("date")
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _set_date_cache(config_id: int, value: date) -> None:
    sql = f"INSERT INTO {TABLE_PYTHON_CONFIG} (id, data) VALUES (%s, %s) ON DUPLICATE KEY UPDATE data = VALUES(data)"
    try:
        with db_session() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    sql, (config_id, json.dumps({"date": value.isoformat()}))
                )
            conn.commit()
    except Exception as e:
        logger.error(f"Error writing date cache to DB: {e}")


def get_referral_fax_date() -> date | None:
    return _get_date_cache(_REFERRAL_FAX_DATE_ID)


def set_referral_fax_date(value: date) -> None:
    _set_date_cache(_REFERRAL_FAX_DATE_ID, value)


def get_sync_report_date() -> date | None:
    return _get_date_cache(_SYNC_REPORT_DATE_ID)


def set_sync_report_date(value: date) -> None:
    _set_date_cache(_SYNC_REPORT_DATE_ID, value)


@provide_connection
def filter_clients_with_changed_address(
    clients: pd.DataFrame, connection: Connection[DictCursor]
) -> pd.DataFrame:
    """Identifies clients with new or changed addresses by comparing them to records in the database. Also, filters out clients with no address."""
    initial_count = len(clients)
    clients_with_address = clients.dropna(subset=["ADDRESS"])
    clients_with_address = cast(
        pd.DataFrame,
        clients_with_address[clients_with_address["ADDRESS"].str.strip() != ""],
    )
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

    db_addresses = db_addresses.rename(
        columns={"id": "CLIENT_ID", "address": "DB_ADDRESS"}
    )
    db_addresses["CLIENT_ID"] = db_addresses["CLIENT_ID"].astype(str)

    clients_with_address["CLIENT_ID"] = clients_with_address["CLIENT_ID"].astype(str)
    clients_with_address["NORMALIZED_ADDRESS"] = (
        clients_with_address["ADDRESS"].fillna("").str.lower().str.strip()
    )
    db_addresses["NORMALIZED_ADDRESS"] = (
        db_addresses["DB_ADDRESS"].fillna("").str.lower().str.strip()
    )

    merged_df = clients_with_address.merge(
        db_addresses,
        on="CLIENT_ID",
        how="left",
        suffixes=("_new", "_db"),
    )

    changed_mask = (
        merged_df["NORMALIZED_ADDRESS_new"] != merged_df["NORMALIZED_ADDRESS_db"]
    ) | merged_df["NORMALIZED_ADDRESS_db"].isna()

    changed_clients = cast(pd.DataFrame, merged_df[changed_mask])

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
        df = df.rename(columns=CLIENT_COLUMN_MAPPING)
    return df


@provide_connection
def put_clients_in_db(clients_df: pd.DataFrame, connection: Connection[DictCursor]):
    """Inserts or updates client data in the database from a DataFrame."""
    logger.debug("Inserting clients into database")

    values_to_insert = []
    new_status_by_id: dict[str, bool] = {}

    for _, client in clients_df.iterrows():
        client_id = get_column(client, "CLIENT_ID")
        if client_id is None:
            logger.warning(
                f"Skipping {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')} with no ID"
            )
            continue

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

        new_status = get_column(client, "STATUS") != "Inactive"
        new_status_by_id[str(client_id)] = new_status

        values = (
            client_id,
            hashlib.md5(str(client_id).encode("utf-8")).hexdigest(),
            new_status,
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
            get_column(client, "ASD_ADHD"),
            get_column(client, "LANGUAGE", default="English"),
            gender,
            phone_number,
            email,
            get_column(client, "FLAG"),
            get_column(client, "LOGIN_NAME", default=None),
            get_column(client, "REFERRAL_SOURCE", default=None),
        )
        values_to_insert.append(values)

    sql = f"""
        INSERT INTO `{TABLE_CLIENT}` (id, hash, status, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, latitude, longitude, asdAdhd, language, gender, phoneNumber, email, flag, taUser, referralSource)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            asdAdhd = CASE WHEN VALUES(asdAdhd) IS NOT NULL THEN VALUES(asdAdhd) ELSE asdAdhd END,
            language = CASE WHEN VALUES(language) IS NOT NULL THEN VALUES(language) ELSE language END,
            gender = VALUES(gender),
            phoneNumber = VALUES(phoneNumber),
            email = VALUES(email),
            flag = VALUES(flag),
            taUser = VALUES(taUser),
            referralSource = CASE WHEN VALUES(referralSource) IS NOT NULL THEN VALUES(referralSource) ELSE referralSource END;
    """

    client_ids = [str(v[0]) for v in values_to_insert]
    old_status_by_id: dict[str, bool] = {}
    if client_ids:
        placeholders = ", ".join(["%s"] * len(client_ids))
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT id, status FROM `{TABLE_CLIENT}` WHERE id IN ({placeholders})",
                client_ids,
            )
            for row in cursor.fetchall():
                old_status_by_id[str(row["id"])] = bool(row["status"])

    with connection.cursor() as cursor:
        cursor.executemany(sql, values_to_insert)
    connection.commit()

    logger.info(f"Successfully inserted/updated {len(values_to_insert)} clients.")

    reactivated_ids = [
        client_id
        for client_id in client_ids
        if old_status_by_id.get(client_id) is False
        and new_status_by_id.get(client_id) is True
    ]
    for client_id in reactivated_ids:
        logger.info(f"Client {client_id} reactivated - starting a new session")
        reset_client_session(int(client_id), connection=connection)


def _build_reactivation_note_block(reactivated_on: str) -> list[dict]:
    """ProseMirror/TipTap nodes marking where a new session's notes begin."""
    return [
        {
            "type": "heading",
            "attrs": {"level": 3},
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Client reactivated on {reactivated_on} - data above is "
                        "new, data below is from before and excluded from "
                        "calculations"
                    ),
                }
            ],
        },
        {"type": "horizontalRule"},
        {"type": "paragraph"},
    ]


@provide_connection
def reset_client_session(client_id: int, connection: Connection[DictCursor]) -> None:
    """Archives a reactivated client's prior-session data and starts a fresh one.

    Runs when a client's status flips from Inactive back to Active in the TA
    import. Mutable "current state" rows (in-person assessments, insurance
    review) are archived into their history tables and reset in place;
    failures are cleared outright; a separator is prepended to the client's
    notes; and `sessionStartedAt` is stamped so calculations can exclude
    everything before it.
    """
    now = datetime.utcnow()

    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT id, status, addedDate, appointmentId FROM `{TABLE_IN_PERSON_ASSESSMENT}` "
            "WHERE clientId = %s",
            (client_id,),
        )
        assessments = cursor.fetchall()

        for assessment in assessments:
            content = {
                "status": assessment["status"],
                "addedDate": assessment["addedDate"].isoformat()
                if assessment["addedDate"]
                else None,
                "appointmentId": assessment["appointmentId"],
            }
            cursor.execute(
                f"INSERT INTO `{TABLE_IN_PERSON_ASSESSMENT_HISTORY}` (assessmentId, content) "
                "VALUES (%s, %s)",
                (assessment["id"], json.dumps(content)),
            )
            cursor.execute(
                f"UPDATE `{TABLE_IN_PERSON_ASSESSMENT}` SET status = NULL, addedDate = NULL, "
                "appointmentId = NULL WHERE id = %s",
                (assessment["id"],),
            )

        cursor.execute(
            f"SELECT content, updatedBy FROM `{TABLE_INSURANCE_REVIEW}` WHERE clientId = %s",
            (client_id,),
        )
        review = cursor.fetchone()
        if review and review["content"] is not None:
            cursor.execute(
                f"INSERT INTO `{TABLE_INSURANCE_REVIEW_HISTORY}` (reviewId, content, updatedBy) "
                "VALUES (%s, %s, %s)",
                (client_id, review["content"], review["updatedBy"]),
            )
            cursor.execute(
                f"UPDATE `{TABLE_INSURANCE_REVIEW}` SET content = NULL, "
                "submittedToNotesAt = NULL WHERE clientId = %s",
                (client_id,),
            )

        cursor.execute(
            f"DELETE FROM `{TABLE_FAILURE}` WHERE clientId = %s", (client_id,)
        )

        cursor.execute(
            f"SELECT content, title, updatedBy FROM `{TABLE_NOTE}` WHERE clientId = %s",
            (client_id,),
        )
        note = cursor.fetchone()
        separator = _build_reactivation_note_block(now.date().isoformat())

        if note is None:
            cursor.execute(
                f"INSERT INTO `{TABLE_NOTE}` (clientId, content) VALUES (%s, %s)",
                (client_id, json.dumps({"type": "doc", "content": separator})),
            )
        else:
            if note["content"] is not None:
                cursor.execute(
                    f"INSERT INTO `{TABLE_NOTE_HISTORY}` (noteId, content, title, updatedBy) "
                    "VALUES (%s, %s, %s, %s)",
                    (client_id, note["content"], note["title"], note["updatedBy"]),
                )
            existing_content = (
                json.loads(note["content"])
                if note["content"]
                else {"type": "doc", "content": []}
            )
            new_content = {
                "type": "doc",
                "content": [*separator, *(existing_content.get("content") or [])],
            }
            cursor.execute(
                f"UPDATE `{TABLE_NOTE}` SET content = %s WHERE clientId = %s",
                (json.dumps(new_content), client_id),
            )

        cursor.execute(
            f"UPDATE `{TABLE_CLIENT}` SET sessionStartedAt = %s WHERE id = %s",
            (now, client_id),
        )

    connection.commit()


@provide_connection
def sync_client_insurance_from_policies(connection: Connection[DictCursor]):
    """Derives client-level insurance summary fields from the clientInsurancePolicies table."""
    logger.debug("Syncing client insurance summary from policies")
    sql = f"""
        UPDATE `{TABLE_CLIENT}` c SET
            primaryInsurance = (
                SELECT COALESCE(insuranceCompanyName, policyCompanyName)
                FROM `{TABLE_CLIENT_INSURANCE_POLICY}` p
                WHERE p.clientId = c.id
                  AND p.policyType = 'PRIMARY'
                  AND (p.policyEndDate IS NULL OR p.policyEndDate >= CURDATE())
                ORDER BY p.policyStartDate DESC
                LIMIT 1
            ),
            secondaryInsurance = (
                SELECT JSON_ARRAYAGG(name)
                FROM (
                    SELECT DISTINCT COALESCE(insuranceCompanyName, policyCompanyName) AS name
                    FROM `{TABLE_CLIENT_INSURANCE_POLICY}` p
                    WHERE p.clientId = c.id
                      AND p.policyType = 'SECONDARY'
                      AND (p.policyEndDate IS NULL OR p.policyEndDate >= CURDATE())
                ) AS secondary_names
            ),
            precertExpires = (
                SELECT MAX(p.precertExpireDate)
                FROM `{TABLE_CLIENT_INSURANCE_POLICY}` p
                WHERE p.clientId = c.id
            ),
            privatePay = COALESCE((
                SELECT MAX(COALESCE(p.privatePay, 0))
                FROM `{TABLE_CLIENT_INSURANCE_POLICY}` p
                WHERE p.clientId = c.id
            ), 0)
    """
    with connection.cursor() as cursor:
        cursor.execute(sql)
    connection.commit()
    logger.info("Client insurance summary synced from policies.")


SCM_ALIAS = "SCM"
DEFAULT_EMAIL = "barbara@driftwoodeval.com"


@provide_connection
def sync_scm_insurance_reviews(connection: Connection[DictCursor]):
    """Creates insurance_review rows for SCM clients that don't have one yet."""
    logger.debug("Syncing SCM insurance review records")

    # Collect all insurance names (shortName + aliases) that map to SCM
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT i.id, i.shortName
            FROM `{TABLE_INSURANCE}` i
            LEFT JOIN `{TABLE_INSURANCE_ALIAS}` a ON a.insuranceId = i.id
            WHERE i.shortName = %s OR a.name = %s
            """,
            (SCM_ALIAS, SCM_ALIAS),
        )
        scm_insurance_rows = cursor.fetchall()

    if not scm_insurance_rows:
        logger.info("No SCM insurance found; skipping review sync.")
        return

    scm_ids = list({row["id"] for row in scm_insurance_rows})
    id_placeholders = ", ".join(["%s"] * len(scm_ids))

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT i.shortName AS name FROM `{TABLE_INSURANCE}` i WHERE i.id IN ({id_placeholders})
            UNION
            SELECT a.name FROM `{TABLE_INSURANCE_ALIAS}` a WHERE a.insuranceId IN ({id_placeholders})
            """,
            scm_ids + scm_ids,
        )
        name_rows = cursor.fetchall()

    scm_names = [row["name"] for row in name_rows]
    if not scm_names:
        return

    name_placeholders = ", ".join(["%s"] * len(scm_names))

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT c.id
            FROM `{TABLE_CLIENT}` c
            LEFT JOIN `{TABLE_INSURANCE_REVIEW}` ir ON ir.clientId = c.id
            WHERE c.primaryInsurance IN ({name_placeholders})
              AND ir.clientId IS NULL
              AND c.status = 1
            """,
            scm_names,
        )
        clients_to_backfill = cursor.fetchall()

    if not clients_to_backfill:
        logger.info("All SCM clients already have insurance review records.")
        return

    rows = [
        (client["id"], True, DEFAULT_EMAIL, DEFAULT_EMAIL)
        for client in clients_to_backfill
    ]

    with connection.cursor() as cursor:
        cursor.executemany(
            f"""
            INSERT INTO `{TABLE_INSURANCE_REVIEW}` (clientId, enabled, claimed_user_email, updated_by)
            VALUES (%s, %s, %s, %s)
            """,
            rows,
        )
    connection.commit()
    logger.info(f"Created {len(rows)} SCM insurance review record(s).")


@provide_connection
def update_client_medicaid_eligibility(
    client_id: int,
    qual_category: str,
    payment_category: str,
    connection: Connection[DictCursor],
) -> None:
    """Updates qual_category and payment_category on the client record."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE `{TABLE_CLIENT}` SET qual_category = %s, payment_category = %s WHERE id = %s",
            (qual_category, payment_category, client_id),
        )
    connection.commit()


@provide_connection
def get_scm_clients_with_medicaid_ids(
    only_new: bool = True,
    connection: Connection[DictCursor] | None = None,
) -> list[dict]:
    """Returns active clients with SCM insurance and their medicaid (insurance) numbers."""
    assert connection is not None
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT i.id, i.shortName
            FROM `{TABLE_INSURANCE}` i
            LEFT JOIN `{TABLE_INSURANCE_ALIAS}` a ON a.insuranceId = i.id
            WHERE i.shortName = %s OR a.name = %s
            """,
            (SCM_ALIAS, SCM_ALIAS),
        )
        scm_insurance_rows = cursor.fetchall()

    if not scm_insurance_rows:
        return []

    scm_ids = list({row["id"] for row in scm_insurance_rows})
    id_placeholders = ", ".join(["%s"] * len(scm_ids))

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT i.shortName AS name FROM `{TABLE_INSURANCE}` i WHERE i.id IN ({id_placeholders})
            UNION
            SELECT a.name FROM `{TABLE_INSURANCE_ALIAS}` a WHERE a.insuranceId IN ({id_placeholders})
            """,
            scm_ids + scm_ids,
        )
        name_rows = cursor.fetchall()

    scm_names = [row["name"] for row in name_rows]
    if not scm_names:
        return []

    name_placeholders = ", ".join(["%s"] * len(scm_names))

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT c.id, c.firstName, c.lastName, p.insuranceNumber
            FROM `{TABLE_CLIENT}` c
            JOIN `{TABLE_CLIENT_INSURANCE_POLICY}` p ON p.clientId = c.id
            WHERE c.primaryInsurance IN ({name_placeholders})
              AND c.status = 1
              AND p.policyType = 'PRIMARY'
              AND (p.policyEndDate IS NULL OR p.policyEndDate >= CURDATE())
              AND p.insuranceNumber IS NOT NULL
              AND p.insuranceNumber != ''
              {" AND c.qual_category IS NULL" if only_new else ""}
            ORDER BY c.lastName, c.firstName
            """,
            scm_names,
        )
        return list(cursor.fetchall())


@provide_connection
def put_client_insurance_policies_in_db(
    insurance_df: pd.DataFrame, connection: Connection[DictCursor]
):
    """Inserts or updates all client insurance policies from the raw insurance CSV."""
    logger.debug("Inserting client insurance policies into database")

    def _parse_date(val) -> str | None:
        if pd.isna(val) or val == "":
            return None
        try:
            return format_date(val)
        except Exception:
            return None

    def _parse_bool(val) -> bool | None:
        if pd.isna(val) or val == "":
            return None
        if isinstance(val, bool):
            return val
        return str(val).strip().upper() in ("TRUE", "YES", "1", "Y")

    values_to_insert = []

    # Collect all candidate integer client IDs so we can pre-check FK existence.
    candidate_ids: set[int] = set()
    for _, row in insurance_df.iterrows():
        cid = get_column(row, "CLIENT_ID")
        if cid is None or isinstance(cid, list):
            continue
        try:
            candidate_ids.add(int(cid))
        except ValueError, TypeError:
            continue

    missing_client_ids: set[int] = set()
    if candidate_ids:
        id_csv = ", ".join(str(i) for i in candidate_ids)
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT id FROM `{TABLE_CLIENT}` WHERE id IN ({id_csv})")
            existing_ids = {r["id"] for r in cursor.fetchall()}
        missing_client_ids = candidate_ids - existing_ids
        if missing_client_ids:
            logger.warning(
                f"{len(missing_client_ids)} client ID(s) appear in insurance data but have no "
                f"matching emr_client row — these policies will be skipped: {sorted(missing_client_ids)}"
            )

    for _, row in insurance_df.iterrows():
        policy_id = get_column(row, "POLICY_ID")
        client_id = get_column(row, "CLIENT_ID")
        if policy_id is None or client_id is None:
            continue
        if isinstance(policy_id, list) or isinstance(client_id, list):
            continue

        try:
            client_id = int(client_id)
        except ValueError, TypeError:
            continue

        if client_id in missing_client_ids:
            continue

        if not os.getenv("DEV_TOGGLE"):
            firstname = get_column(row, "FIRSTNAME")
            lastname = get_column(row, "LASTNAME")
            if f"{firstname} {lastname}".lower() in TEST_NAMES_LOWER:
                continue

        values = (
            policy_id,
            client_id,
            get_column(row, "POLICY_TYPE"),
            _parse_date(get_column(row, "POLICY_STARTDATE")),
            _parse_date(get_column(row, "POLICY_ENDDATE")),
            _parse_date(get_column(row, "POLICY_ADDEDDATE")),
            get_column(row, "POLICY_ADDEDBYNAME"),
            _parse_date(get_column(row, "POLICY_MODIFIEDDATE")),
            get_column(row, "POLICY_MODIFIEDBYNAME"),
            _parse_bool(get_column(row, "POLICY_PRIVATEPAY")),
            get_column(row, "POLICY_PLANNAME"),
            get_column(row, "POLICY_INSURANCENUMBER"),
            get_column(row, "POLICY_GROUPNUMBER"),
            get_column(row, "POLICY_EMPLOYER"),
            get_column(row, "POLICY_COMPANYNAME"),
            format_phone_number(get_column(row, "POLICY_COMPANYPHONE")),
            get_column(row, "POLICY_MEMO"),
            get_column(row, "POLICY_CLIENTMEMO"),
            get_column(row, "INSURANCE_INSURANCETYPE"),
            get_column(row, "INSURANCE_COMPANYNAME"),
            get_column(row, "INSURANCE_PAYERID"),
            format_phone_number(get_column(row, "INSURANCE_PHONE")),
            format_phone_number(get_column(row, "INSURANCE_PRECERTPHONE")),
            get_column(row, "INSURANCE_WEBSITE"),
            get_column(row, "INSURANCE_ADDRESS1"),
            get_column(row, "INSURANCE_ADDRESS2"),
            get_column(row, "INSURANCE_ADDRESS3"),
            get_column(row, "INSURANCE_CITY"),
            get_column(row, "INSURANCE_STATE"),
            get_column(row, "INSURANCE_ZIP"),
            get_column(row, "INSURANCE_COUNTRY"),
            get_column(row, "POLICY_INSUREDFNAME"),
            get_column(row, "POLICY_INSUREDMNAME"),
            get_column(row, "POLICY_INSUREDLNAME"),
            format_phone_number(get_column(row, "POLICY_INSUREDPHONE")),
            _parse_date(get_column(row, "POLICY_INSUREDDOB")),
            format_gender(get_column(row, "POLICY_INSUREDGENDER")),
            get_column(row, "POLICY_INSUREDADDRESS1"),
            get_column(row, "POLICY_INSUREDADDRESS2"),
            get_column(row, "POLICY_INSUREDADDRESS3"),
            get_column(row, "POLICY_INSUREDCITY"),
            get_column(row, "POLICY_INSUREDSTATE"),
            get_column(row, "POLICY_INSUREDZIP"),
            get_column(row, "POLICY_INSUREDCOUNTRY"),
            get_column(row, "POLICY_INSUREDRELATION"),
            get_column(row, "POLICY_INSUREDRELATIONOTHER"),
            get_column(row, "POLICY_REFERROLE"),
            get_column(row, "POLICY_REFERNAME"),
            get_column(row, "POLICY_REFERNPI"),
            get_column(row, "BENEFITS_CPT"),
            get_column(row, "BENEFITS_DEDUCTABLE"),
            get_column(row, "BENEFITS_DEDUCTABLEMET"),
            get_column(row, "BENEFITS_PAYSAT"),
            _parse_bool(get_column(row, "BENEFITS_ISCOPAY")),
            _parse_bool(get_column(row, "BENEFITS_PRECERTREQUIRED")),
            get_column(row, "BENEFITS_TREATFREQUENCY"),
            get_column(row, "BENEFITS_COPAYAMOUNT"),
            get_column(row, "BENEFITS_COPAYPERCENT"),
            _parse_date(get_column(row, "BENEFITS_AUTHDATE")),
            get_column(row, "BENEFITS_AUTHNUMBER"),
            get_column(row, "BENEFITS_SPOKETO"),
            get_column(row, "PRECERT_CPT"),
            _parse_date(get_column(row, "PRECERT_STARTDATE")),
            _parse_date(get_column(row, "PRECERT_EXPIREDATE")),
            get_column(row, "PRECERT_VISITALLOWED"),
            get_column(row, "PRECERT_VISITUSED"),
            _parse_date(get_column(row, "PRECERT_AUTHDATE")),
            get_column(row, "PRECERT_AUTHNUMBER"),
            get_column(row, "PRECERT_SPOKETO"),
            get_column(row, "PRECERT_MEMO"),
        )
        values_to_insert.append(values)

    if not values_to_insert:
        logger.info("No insurance policies to insert.")
        return

    cols = (
        "policyId, clientId, policyType, policyStartDate, policyEndDate, "
        "policyAddedDate, policyAddedByName, policyModifiedDate, policyModifiedByName, "
        "privatePay, planName, insuranceNumber, groupNumber, employer, "
        "policyCompanyName, policyCompanyPhone, memo, clientMemo, "
        "insuranceType, insuranceCompanyName, insurancePayerId, insurancePhone, "
        "insurancePrecertPhone, insuranceWebsite, "
        "insuranceAddress1, insuranceAddress2, insuranceAddress3, "
        "insuranceCity, insuranceState, insuranceZip, insuranceCountry, "
        "insuredFirstName, insuredMiddleName, insuredLastName, insuredPhone, "
        "insuredDob, insuredGender, "
        "insuredAddress1, insuredAddress2, insuredAddress3, "
        "insuredCity, insuredState, insuredZip, insuredCountry, "
        "insuredRelation, insuredRelationOther, "
        "referRole, referName, referNpi, "
        "benefitsCpt, deductible, deductibleMet, paysAt, isCopay, precertRequired, "
        "treatFrequency, copayAmount, copayPercent, "
        "benefitsAuthDate, benefitsAuthNumber, benefitsSpokeTO, "
        "precertCpt, precertStartDate, precertExpireDate, "
        "precertVisitAllowed, precertVisitUsed, "
        "precertAuthDate, precertAuthNumber, precertSpokeTO, precertMemo"
    )

    placeholders = ", ".join(["%s"] * len(values_to_insert[0]))

    update_cols = [c.strip() for c in cols.split(",") if c.strip() != "policyId"]
    on_duplicate = ", ".join(f"{c} = VALUES({c})" for c in update_cols)

    sql_stmt = f"""
        INSERT INTO `{TABLE_CLIENT_INSURANCE_POLICY}` ({cols})
        VALUES ({placeholders})
        ON DUPLICATE KEY UPDATE {on_duplicate};
    """

    with connection.cursor() as cursor:
        cursor.executemany(sql_stmt, values_to_insert)
    connection.commit()

    logger.info(
        f"Successfully inserted/updated {len(values_to_insert)} insurance policies."
    )


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


def resolve_failure_in_db(
    client_id: int | str, reason: str, connection: Connection[DictCursor]
) -> None:
    """Marks a failure as resolved by bumping reminded past the display threshold."""
    sql = f"UPDATE {TABLE_FAILURE} SET reminded = reminded + 100 WHERE clientId = %s AND reason = %s"
    with connection.cursor() as cursor:
        cursor.execute(sql, (int(client_id), reason))
    connection.commit()


@provide_connection
def put_appointment_in_db(
    appointment_id: str,
    client_id: int,
    evaluator_npi: int,
    cpt: str,
    start_time: datetime,
    end_time: datetime,
    connection: Connection[DictCursor],
    da_eval: Literal["EVAL", "DA", "DAEVAL"] | None = None,
    asd_adhd: Literal["ASD", "ADHD", "ASD+ADHD", "ASD+LD", "ADHD+LD", "LD"]
    | None = None,
    cancelled: bool | None = False,
    location: str | None = None,
    gcal_event_id: str | None = None,
    gcal_event_title: str | None = None,
    confirmed_at: datetime | None = None,
    billing_only: bool = False,
):
    """Inserts an appointment into the database."""
    with connection.cursor() as cursor:
        cursor.execute(f"SELECT 1 FROM `{TABLE_CLIENT}` WHERE id = %s", (client_id,))
        if not cursor.fetchone():
            logger.warning(
                f"Skipping appointment {appointment_id}: no client row found for client_id={client_id}"
            )
            return

        cursor.execute(
            f"SELECT startTime, confirmedAt FROM `{TABLE_APPOINTMENT}` WHERE id = %s",
            (appointment_id,),
        )
        existing = cursor.fetchone()
        if (
            existing
            and existing["confirmedAt"] is not None
            and existing["startTime"] != start_time
        ):
            logger.warning(
                f"Appointment {appointment_id}: startTime changed from {existing['startTime']} to {start_time} - confirmedAt will be cleared (was {existing['confirmedAt']})"
            )

    sql = f"""
        INSERT INTO `{TABLE_APPOINTMENT}` (id, clientId, evaluatorNpi, startTime, endTime, daEval, asdAdhd, cancelled, locationKey, calendarEventId, cpt, calendarEventTitle, confirmedAt, billingOnly)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            clientId = VALUES(clientId),
            evaluatorNpi = VALUES(evaluatorNpi),
            startTime = VALUES(startTime),
            endTime = VALUES(endTime),
            daEval = CASE WHEN VALUES(daEval) IS NOT NULL THEN VALUES(daEval) ELSE daEval END,
            asdAdhd = CASE WHEN VALUES(asdAdhd) IS NOT NULL THEN VALUES(asdAdhd) ELSE asdAdhd END,
            cancelled = CASE WHEN startTime != VALUES(startTime) THEN 0 ELSE VALUES(cancelled) END,
            rescheduled = CASE WHEN startTime != VALUES(startTime) THEN 0 ELSE rescheduled END,
            locationKey = CASE WHEN VALUES(locationKey) IS NOT NULL THEN VALUES(locationKey) ELSE locationKey END,
            calendarEventId = CASE WHEN VALUES(calendarEventId) IS NOT NULL THEN VALUES(calendarEventId) ELSE calendarEventId END,
            cpt = VALUES(cpt),
            calendarEventTitle = CASE WHEN VALUES(calendarEventTitle) IS NOT NULL THEN VALUES(calendarEventTitle) ELSE calendarEventTitle END,
            confirmedAt = CASE WHEN startTime != VALUES(startTime) THEN NULL WHEN confirmedAt IS NOT NULL THEN confirmedAt WHEN VALUES(confirmedAt) IS NOT NULL THEN VALUES(confirmedAt) ELSE NULL END,
            billingOnly = VALUES(billingOnly);
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
        cpt,
        gcal_event_title,
        confirmed_at,
        billing_only,
    )

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        connection.commit()


@provide_connection
def get_evaluators_with_blocked_locations(
    connection: Connection[DictCursor],
    npi: int | None = None,
):
    """Fetches evaluators from the database, including their blocked zip codes and school districts.

    Pass npi to fetch a single evaluator; omit to fetch all.
    """
    evaluators: dict[int, dict] = {}
    npi_filter = "WHERE npi = %s" if npi is not None else ""
    npi_join_filter = "WHERE bsd.evaluatorNpi = %s" if npi is not None else ""
    npi_zip_filter = "WHERE evaluatorNpi = %s" if npi is not None else ""
    npi_ins_filter = "WHERE eti.evaluatorNpi = %s" if npi is not None else ""
    params = (npi,) if npi is not None else ()

    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT * FROM {TABLE_EVALUATOR} {npi_filter}", params)
            for row in cursor.fetchall():
                evaluators[row["npi"]] = {
                    **row,
                    "blockedSchoolDistricts": [],
                    "blockedZipCodes": [],
                }

            cursor.execute(
                f"""
                SELECT bsd.evaluatorNpi, sd.fullName AS schoolDistrictName
                FROM {TABLE_BLOCKED_SCHOOL_DISTRICT} AS bsd
                JOIN {TABLE_SCHOOL_DISTRICT} AS sd ON bsd.schoolDistrictId = sd.id
                {npi_join_filter}
                """,
                params,
            )
            for row in cursor.fetchall():
                if row["evaluatorNpi"] in evaluators:
                    evaluators[row["evaluatorNpi"]]["blockedSchoolDistricts"].append(
                        row["schoolDistrictName"]
                    )

            cursor.execute(
                f"SELECT evaluatorNpi, zipCode FROM {TABLE_BLOCKED_ZIP_CODE} {npi_zip_filter}",
                params,
            )
            for row in cursor.fetchall():
                if row["evaluatorNpi"] in evaluators:
                    evaluators[row["evaluatorNpi"]]["blockedZipCodes"].append(
                        row["zipCode"]
                    )

            cursor.execute(
                f"""
                SELECT eti.evaluatorNpi, i.shortName
                FROM {TABLE_EVALUATORS_TO_INSURANCES} AS eti
                JOIN {TABLE_INSURANCE} AS i ON eti.insuranceId = i.id
                {npi_ins_filter}
                """,
                params,
            )
            for row in cursor.fetchall():
                if row["evaluatorNpi"] in evaluators:
                    evaluators[row["evaluatorNpi"]][row["shortName"]] = True
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
    params = [client_id, *list(evaluator_npis)]

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

    sql = f"""
    INSERT INTO {TABLE_CLIENT_EVAL} (clientId, evaluatorNpi)
    VALUES (%s, %s)
    ON DUPLICATE KEY UPDATE
        clientId = VALUES(clientId),
        evaluatorNpi = VALUES(evaluatorNpi)
    """
    with connection.cursor() as cursor:
        cursor.executemany(sql, [(client_id, npi) for npi in evaluator_npis])
    connection.commit()


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

        if not client_id or client_id in {"nan", "None"}:
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

    specific_client_ids = {str(client_id).strip() for client_id in specific_client_ids}
    clients_to_process = clients[
        clients["CLIENT_ID"].astype(str).isin(list(specific_client_ids))
    ]

    _delete_all_relationships_for_clients(specific_client_ids, connection=connection)
    insurance_mappings = get_insurance_mappings(connection=connection)

    updated_count = 0

    for _, client in clients_to_process.iterrows():
        client_id_raw = get_column(client, "CLIENT_ID")
        client_id = str(client_id_raw)

        if not client_id or client_id in {"nan", "None"}:
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
def get_client_id_to_asd_adhd_map(
    connection: Connection[DictCursor],
) -> dict[int, str]:
    """Returns a dictionary mapping client ID (int) to their asdAdhd value (str)."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT id, asdAdhd FROM {TABLE_CLIENT}")
            results = cursor.fetchall()
            return {row["id"]: row["asdAdhd"] for row in results if row["asdAdhd"]}
    except Exception:
        logger.exception("Error fetching client ID to asdAdhd map")
        return {}


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


@provide_connection
def get_queue_notify_users(connection: Connection[DictCursor]):
    """Returns a list of users who have the reports:notifications permission and no active claimed report."""
    users = []
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT email, name, permissions, claimed_report_folder, blocked_evaluator_npis FROM {TABLE_USER} WHERE archived = 0"
        )
        rows = cursor.fetchall()

        for row in rows:
            permissions = json.loads(row["permissions"]) if row["permissions"] else {}
            if (
                permissions.get("reports:notifications") is True
                and not row["claimed_report_folder"]
            ):
                users.append(row)

    return users


@provide_connection
def get_most_recent_non_billing_evaluator_npi(
    connection: Connection[DictCursor], client_id: str
) -> int | None:
    """Returns the evaluator NPI from the most recent non-billing-only appointment for the client."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT evaluatorNpi FROM `{TABLE_APPOINTMENT}` "
                "WHERE clientId = %s AND billingOnly = 0 AND cancelled = 0 AND placeholder = 0 "
                "ORDER BY startTime DESC LIMIT 1",
                (client_id,),
            )
            row = cursor.fetchone()
            return row["evaluatorNpi"] if row else None
    except Exception:
        logger.exception(f"Error fetching evaluator NPI for client {client_id}")
        return None


@provide_connection
def get_client_id_to_dob_map(
    connection: Connection[DictCursor],
) -> dict[int, date]:
    """Returns a dictionary mapping client ID (int) to their date of birth."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT id, dob FROM {TABLE_CLIENT} WHERE dob IS NOT NULL")
            results = cursor.fetchall()
            return {row["id"]: row["dob"] for row in results if row["dob"]}
    except Exception:
        logger.exception("Error fetching client ID to DOB map")
        return {}


@provide_connection
def get_questionnaire_rules_with_in_person(
    connection: Connection[DictCursor],
) -> list[dict]:
    """Load assessment battery rules, returning both online and in-person assessments."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT daeval, diagnosis, minAge, maxAge, questionnaires, in_person_assessments FROM {TABLE_QUESTIONNAIRE_RULE}"
        )
        rows = cursor.fetchall()

    rules = []
    for row in rows:
        qs = row["questionnaires"]
        if isinstance(qs, str):
            qs = json.loads(qs)
        ip = row["in_person_assessments"]
        if isinstance(ip, str):
            ip = json.loads(ip)
        rules.append(
            {
                "daeval": row["daeval"],
                "diagnosis": row["diagnosis"],
                "minAge": row["minAge"],
                "maxAge": row["maxAge"],
                "questionnaires": qs or [],
                "inPersonAssessments": ip or [],
            }
        )
    return rules


def get_in_person_assessments_for_client(
    age: int,
    asd_adhd: str | None,
    da_eval: str | None,
    rules: list[dict],
) -> list[str]:
    """Return in-person assessment names for a client based on battery rules.

    Mirrors the online questionnaire lookup but uses the inPersonAssessments field.
    Returns an empty list if no matching rules found.
    """
    if da_eval is None or asd_adhd is None:
        return []

    check = asd_adhd
    if check in ("ASD+LD", "Both"):
        check = "ASD"
    elif check == "ADHD+LD":
        check = "ADHD"

    def _lookup(daeval_key: str, diagnosis_key: str | None) -> list[str]:
        matches = [
            r
            for r in rules
            if r["daeval"] == daeval_key
            and r["diagnosis"] == diagnosis_key
            and r["minAge"] <= age <= r["maxAge"]
        ]
        result: list[str] = []
        for m in matches:
            for a in m["inPersonAssessments"]:
                if a not in result:
                    result.append(a)
        return result

    if check == "ASD+ADHD":
        asd = _lookup(da_eval, "ASD")
        adhd = _lookup(da_eval, "ADHD")
        combined = asd[:]
        for a in adhd:
            if a not in combined:
                combined.append(a)
        return combined

    diagnosis_key = check if check in ("ASD", "ADHD") else None
    specific = _lookup(da_eval, diagnosis_key)
    if specific:
        return specific
    return _lookup(da_eval, None)


@provide_connection
def rematch_evaluator(npi: int, connection: Connection[DictCursor]) -> None:
    """Re-runs client matching for a single evaluator after their settings change."""
    logger.info(f"Running rematch for evaluator NPI {npi}")

    evaluators = get_evaluators_with_blocked_locations(npi=npi, connection=connection)
    if not evaluators:
        logger.warning(f"Evaluator {npi} not found, skipping rematch")
        return

    clients = get_all_clients(connection=connection)
    if clients.empty:
        return

    insert_by_matching_criteria_incremental(clients, evaluators, connection=connection)


@provide_connection
def put_in_person_assessments_in_db(
    client_id: int,
    assessment_types: list[str],
    added_date: date,
    connection: Connection[DictCursor],
    appointment_id: str | None = None,
) -> None:
    """Insert in-person assessments for a client, skipping any that already exist."""
    if not assessment_types:
        return

    with connection.cursor() as cursor:
        cursor.executemany(
            f"""
            INSERT IGNORE INTO {TABLE_IN_PERSON_ASSESSMENT}
                (clientId, assessmentType, addedDate, appointmentId)
            VALUES (%s, %s, %s, %s)
            """,
            [
                (client_id, assessment_type, added_date, appointment_id)
                for assessment_type in assessment_types
            ],
        )
    connection.commit()
    logger.info(
        f"Added {len(assessment_types)} in-person assessment(s) for client {client_id}"
    )


@provide_connection
def mark_posteval_pending_questionnaires(connection: Connection[DictCursor]) -> None:
    """Set PENDING questionnaires to POSTEVAL_PENDING for clients whose eval appointment has passed.

    A client is considered post-eval when they have at least one non-cancelled EVAL
    appointment whose startTime is in the past.
    """
    sql = f"""
        UPDATE {TABLE_QUESTIONNAIRE} q
        JOIN (
            SELECT DISTINCT clientId
            FROM {TABLE_APPOINTMENT}
            WHERE daEval IN ('EVAL', 'DAEVAL')
              AND cancelled = 0
              AND startTime < NOW()
        ) past_eval ON past_eval.clientId = q.clientId
        SET q.status = 'POSTEVAL_PENDING'
        WHERE q.status = 'PENDING'
    """
    with connection.cursor() as cursor:
        cursor.execute(sql)
        updated = cursor.rowcount
    connection.commit()
    if updated:
        logger.info(f"Marked {updated} questionnaire(s) as POSTEVAL_PENDING")


@provide_connection
def compute_and_store_assessment_snapshot(
    client_id: int,
    connection: Connection[DictCursor],
) -> None:
    """Compute and store the assessment snapshot for a client.

    Mirrors TypeScript computeAndStoreAssessmentSnapshot. Run when a 90791
    non-DAEVAL appointment is added so the insurance appointment data is locked in.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT dob, asdAdhd, assessment_data FROM {TABLE_CLIENT} WHERE id = %s",
            (client_id,),
        )
        client = cursor.fetchone()

    if not client or not client.get("dob"):
        logger.warning(f"Cannot compute snapshot for client {client_id}: missing dob")
        return

    if client.get("assessment_data") is not None:
        logger.debug(f"Skipping snapshot for client {client_id}: already locked in")
        return

    dob = client["dob"]
    asd_adhd: str | None = client.get("asdAdhd")

    today = date.today()
    age_in_years = (today - dob).days // 365

    # Load and filter rules by age
    rules = get_questionnaire_rules_with_in_person(connection=connection)
    age_filtered = [r for r in rules if r["minAge"] <= age_in_years <= r["maxAge"]]

    # Determine wanted diagnoses (mirrors TypeScript wantedDiagnoses logic)
    if not asd_adhd:
        wanted_diagnoses: set[str | None] = {"ASD", "ADHD"}
    else:
        wanted_diagnoses = set()
        if "ASD" in asd_adhd:
            wanted_diagnoses.add("ASD")
        if "ADHD" in asd_adhd:
            wanted_diagnoses.add("ADHD")

    applicable_rules = [
        r
        for r in age_filtered
        if (r["daeval"] == "DAEVAL" and r["diagnosis"] is None)
        or (r["daeval"] != "DAEVAL" and r["diagnosis"] in wanted_diagnoses)
    ]

    needed_types: set[str] = set()
    for rule in applicable_rules:
        for q in rule.get("questionnaires") or []:
            needed_types.add(q)
        for ipa in rule.get("inPersonAssessments") or []:
            needed_types.add(ipa)

    if not needed_types:
        snapshot = {
            "minutes": 0,
            "computedAt": datetime.utcnow().isoformat() + "Z",
            "ageInYears": age_in_years,
            "asdAdhd": asd_adhd,
            "includedTypes": [],
            "excludedExternal": [],
        }
        _store_snapshot(client_id, snapshot, connection=connection)
        return

    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT questionnaireType AS type FROM {TABLE_QUESTIONNAIRE} "
            f"WHERE clientId = %s AND status = 'EXTERNAL'",
            (client_id,),
        )
        external_qs = {row["type"] for row in cursor.fetchall()}

        cursor.execute(
            f"SELECT assessmentType AS type FROM {TABLE_IN_PERSON_ASSESSMENT} "
            f"WHERE clientId = %s AND status = 'EXTERNAL'",
            (client_id,),
        )
        external_ipas = {row["type"] for row in cursor.fetchall()}

    external_types = external_qs | external_ipas
    excluded_external = [t for t in needed_types if t in external_types]
    billable_types = [t for t in needed_types if t not in external_types]

    minutes = 0
    included_types: list[str] = []
    if billable_types:
        with connection.cursor() as cursor:
            placeholders = ",".join(["%s"] * len(billable_types))
            cursor.execute(
                f"SELECT name, minutes FROM {TABLE_ASSESSMENT_TYPE} "
                f"WHERE name IN ({placeholders})",
                billable_types,
            )
            rows = cursor.fetchall()
        for row in rows:
            included_types.append(row["name"])
            minutes += row["minutes"] or 0

    snapshot = {
        "minutes": minutes,
        "computedAt": datetime.utcnow().isoformat() + "Z",
        "ageInYears": age_in_years,
        "asdAdhd": asd_adhd,
        "includedTypes": included_types,
        "excludedExternal": excluded_external,
    }
    _store_snapshot(client_id, snapshot, connection=connection)
    logger.info(
        f"Stored assessment snapshot for client {client_id}: {minutes} minutes, "
        f"{len(included_types)} types"
    )


@provide_connection
def _store_snapshot(
    client_id: int,
    snapshot: dict,
    connection: Connection[DictCursor],
) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            f"UPDATE {TABLE_CLIENT} SET assessment_data = %s WHERE id = %s",
            (json.dumps(snapshot), client_id),
        )
    connection.commit()
