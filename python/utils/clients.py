import string

import pandas as pd
import utils.database
from download_ta import download_csvs
from loguru import logger

TEST_NAMES = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Barbara Steele",
]


def normalize_names(df: pd.DataFrame) -> pd.DataFrame:
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
        "BabyNet (Combined DA and Eval)": "BabyNet",
        "Aetna Health, Inc.": "AETNA",
        "TriCare East": "Tricare",
        "United Healthcare/OptumHealth / OptumHealth Behavioral Solutions": "United_Optum",
        "Medicaid South Carolina": "SCM",
    }
    return clients.replace({"INSURANCE_COMPANYNAME": insurance_mapping})


def consolidate_by_id(clients: pd.DataFrame) -> pd.DataFrame:
    def _merge_insurance(group: pd.DataFrame) -> pd.Series:
        merged_row = group.iloc[0].copy()
        primary_insurance = set(
            group[group["POLICY_TYPE"] == "PRIMARY"]["INSURANCE_COMPANYNAME"]
            .dropna()
            .tolist()
        )
        secondary_insurance = set(
            group[group["POLICY_TYPE"] == "SECONDARY"]["INSURANCE_COMPANYNAME"]
            .dropna()
            .tolist()
        )
        if primary_insurance:
            merged_row["PRIMARY_INSURANCE_COMPANYNAME"] = list(primary_insurance)[0]
        else:
            merged_row["PRIMARY_INSURANCE_COMPANYNAME"] = None
        if secondary_insurance:
            merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = list(secondary_insurance)
        else:
            merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = None
        return merged_row

    logger.debug("Consolidating clients by ID")
    merged_df = (
        clients.groupby("CLIENT_ID", as_index=False)
        .apply(_merge_insurance, include_groups=False)
        .reset_index(drop=True)
    )
    return merged_df


def combine_address_info(clients: pd.DataFrame) -> pd.DataFrame:
    def _combine_address(client) -> str:
        address_parts = []
        for a in [
            client.USER_ADDRESS_ADDRESS1,
            client.USER_ADDRESS_ADDRESS2,
            client.USER_ADDRESS_ADDRESS3,
        ]:
            if not pd.isna(a) and a != "" and a not in address_parts:
                address_parts.append(
                    string.capwords(str(a).strip().replace(",", "").replace('"', ""))
                )
        address = ", ".join(address_parts)

        city = (
            string.capwords(str(client.USER_ADDRESS_CITY).strip())
            if not pd.isna(client.USER_ADDRESS_CITY)
            else ""
        )
        state = (
            str(client.USER_ADDRESS_STATE).strip().upper()
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


def get_inactive_clients(df: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Getting inactive clients")
    return df[df.STATUS == "Inactive"]


def get_clients() -> pd.DataFrame:
    download_csvs()
    logger.debug("Getting clients from spreadsheets")
    insurance_df = utils.database.open_local_spreadsheet("input/clients-insurance.csv")
    demo_df = utils.database.open_local_spreadsheet("input/clients-demographic.csv")
    clients_df = pd.merge(demo_df, insurance_df)
    clients_df = normalize_names(clients_df)
    clients_df = remove_test_names(clients_df, TEST_NAMES)
    clients_df = map_insurance_names(clients_df)
    clients_df = consolidate_by_id(clients_df)
    clients_df = combine_address_info(clients_df)

    utils.database.set_inactive_clients(get_inactive_clients(clients_df))

    return clients_df
