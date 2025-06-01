import hashlib
import os
import string
from datetime import datetime
from urllib.parse import urlparse

import mysql.connector
import pandas as pd
import utils.relationships
from loguru import logger


def open_local_spreadsheet(file) -> pd.DataFrame:
    with open(file, "r", errors="ignore") as f:
        logger.debug(f"Opening {file}")
        df = pd.read_csv(f)
        return df


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

        try:
            cursor.execute(sql, values)
            cursor.nextset()
            db_connection.commit()
        except mysql.connector.errors.IntegrityError as e:
            logger.error(e)

    db_connection.close()


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
        INSERT INTO `schedule_client` (id, hash, asanaId, addedDate, dob, firstName, lastName, preferredName, fullName, address, schoolDistrict, closestOffice, closestOfficeMiles, secondClosestOffice, secondClosestOfficeMiles, thirdClosestOffice, thirdClosestOfficeMiles, primaryInsurance, secondaryInsurance, privatePay, asdAdhd, interpreter, gender, phoneNumber)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
            string.capwords(client.ADDRESS),
            client.SCHOOL_DISTRICT,
            client.CLOSEST_OFFICE if pd.notna(client.CLOSEST_OFFICE) else None,
            client.CLOSEST_OFFICE_MILES
            if pd.notna(client.CLOSEST_OFFICE_MILES)
            else None,
            client.SECOND_CLOSEST_OFFICE
            if pd.notna(client.SECOND_CLOSEST_OFFICE)
            else None,
            client.SECOND_CLOSEST_OFFICE_MILES
            if pd.notna(client.SECOND_CLOSEST_OFFICE_MILES)
            else None,
            client.THIRD_CLOSEST_OFFICE
            if pd.notna(client.THIRD_CLOSEST_OFFICE)
            else None,
            client.THIRD_CLOSEST_OFFICE_MILES
            if pd.notna(client.THIRD_CLOSEST_OFFICE_MILES)
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
            client.GENDER.title().split(".")[-1] if pd.notna(client.GENDER) else None,
            f"{client.PHONE1:.0f}" if pd.notna(client.PHONE1) else None,
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
