import string

import pandas as pd
import utils.database
from nameparser import HumanName
from loguru import logger
from utils.download_ta import download_csvs
import numpy as np

TEST_NAMES = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Barbara Steele",
]


def normalize_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalizes client names using the nameparser library for intelligent capitalization and handles redundant preferred names."""

    def capitalize_name(name: str) -> str:
        """Applies nameparser capitalization and handles Roman numberals."""
        if pd.isna(name) or not isinstance(name, str):
            return ""
        parsed_name = HumanName(name)
        parsed_name.capitalize(force=True)
        # Handle suffixes that nameparser might misinterpret in this context
        parsed_name.string_format = "{first} {last}"
        # Re-add suffixes after capitalization
        if parsed_name.suffix:
            suffix = parsed_name.suffix.replace("Iii", "III").replace("Ii", "II")
            return f"{str(parsed_name)} {suffix}".strip()
        return str(parsed_name)

    logger.debug("Normalizing client names")
    for col in ["LASTNAME", "FIRSTNAME", "PREFERRED_NAME"]:
        if col in df.columns:
            df.loc[:, col] = df[col].apply(capitalize_name)

    # Nullify preferred name if it's the same as the first name
    if "PREFERRED_NAME" in df.columns and "FIRSTNAME" in df.columns:
        df.loc[df["PREFERRED_NAME"] == df["FIRSTNAME"], "PREFERRED_NAME"] = np.nan
    return df


def remove_test_names(df: pd.DataFrame, test_names: list) -> pd.DataFrame:
    """Removes test names from a DataFrame."""
    logger.debug("Removing test names")
    return df[
        ~df.apply(lambda row: f"{row.FIRSTNAME} {row.LASTNAME}" in test_names, axis=1)
    ]


def map_insurance_names(clients: pd.DataFrame) -> pd.DataFrame:
    """Maps insurance company names to their corresponding internal names."""
    logger.debug("Mapping insurance names")
    insurance_mapping = {
        "Molina Healthcare of South Carolina": "Molina",
        "Humana Behavioral Health (formerly LifeSynch)": "Humana",
        "Absolute Total Care - Medical": "ATC",
        "Select Health of South Carolina": "SH",
        "Healthy Blue South Carolina": "HB",
        "BabyNet (Combined DA and Eval)": "BabyNet",
        "Aetna Health, Inc.": "Aetna",
        "TriCare East": "Tricare",
        "United Healthcare/OptumHealth / OptumHealth Behavioral Solutions": "United_Optum",
        "Medicaid South Carolina": "SCM",
    }
    return clients.replace({"INSURANCE_COMPANYNAME": insurance_mapping})


def consolidate_by_id(clients: pd.DataFrame) -> pd.DataFrame:
    """Consolidates a DataFrame of clients by their IDs. This function expects a DataFrame with columns for the client ID, insurance company name, and policy type. It will group by client ID and merge the insurance company names into separate columns for primary and secondary insurance. If a client has multiple primary or secondary insurances, it will only keep the first one it encounters.

    Returns:
        pd.DataFrame: A DataFrame with the same columns as the input, but with the insurance information merged and the duplicates removed.
    """

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
    """Combines address information from a DataFrame of clients into a single column.

    Expects a DataFrame with columns for the client ID, address parts (USER_ADDRESS_ADDRESS1, USER_ADDRESS_ADDRESS2, USER_ADDRESS_ADDRESS3), city (USER_ADDRESS_CITY), state (USER_ADDRESS_STATE), and zip (USER_ADDRESS_ZIP).

    Returns a DataFrame with the same columns as the input, but with an additional column "ADDRESS" containing the combined address information.
    """

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

        if not any(char.isalnum() for char in address):
            address = ""

        return address

    logger.debug("Combining client address info")
    clients["ADDRESS"] = clients.apply(_combine_address, axis=1)

    return clients


def remove_invalid_clients(clients_df: pd.DataFrame) -> pd.DataFrame:
    logger.debug("Removing clients with invalid IDs")
    clients_df = clients_df[pd.notna(clients_df["CLIENT_ID"])]
    return clients_df


def get_clients() -> pd.DataFrame:
    download_csvs()
    logger.debug("Getting clients from spreadsheets")
    insurance_df = utils.database.open_local_spreadsheet(
        "temp/input/clients-insurance.csv"
    )
    demo_df = utils.database.open_local_spreadsheet(
        "temp/input/clients-demographic.csv"
    )

    clients_df = pd.merge(demo_df, insurance_df, "outer")
    clients_df = normalize_names(clients_df)
    clients_df = remove_test_names(clients_df, TEST_NAMES)
    clients_df = map_insurance_names(clients_df)
    clients_df = consolidate_by_id(clients_df)
    clients_df = remove_invalid_clients(clients_df)
    clients_df = combine_address_info(clients_df)

    utils.database.sync_client_statuses(clients_df)

    return clients_df
