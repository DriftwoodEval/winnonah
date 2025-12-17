import os
import string

import numpy as np
import pandas as pd
from loguru import logger
from nameparser import HumanName
from pandas._libs.missing import NAType

import utils.spreadsheets
from utils.download_ta import download_csvs

TEST_NAMES = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Test Test",
    "Barbara Steele",
]


def _normalize_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalizes client names intelligently, handling capitalization and suffixes."""
    logger.debug("Normalizing client names")

    def capitalize_name_with_exceptions(name: str) -> str:
        if pd.isna(name) or not isinstance(name, str):
            return ""
        parsed_name = HumanName(name)
        parsed_name.capitalize(force=True)

        # Handle suffixes like Jr, Sr, etc. and Roman numerals
        words = str(parsed_name).split()
        if words:
            last_word = words[-1].upper()
            if last_word in {"JR", "SR", "II", "III", "IV", "V"}:
                words[-1] = last_word
        return " ".join(words)

    for col in ["LASTNAME", "FIRSTNAME"]:
        if col in df.columns:
            df[col] = df[col].apply(capitalize_name_with_exceptions)

    # Handle PREFERRED_NAME separately
    if "PREFERRED_NAME" in df.columns and "FIRSTNAME" in df.columns:
        # Only capitalize PREFERRED_NAME if it's not a known suffix
        known_suffixes = {"JR", "SR", "II", "III", "IV", "V"}

        # Create a boolean mask to filter out rows where PREFERRED_NAME is NaN or a known suffix
        mask = df["PREFERRED_NAME"].notna() & ~df["PREFERRED_NAME"].str.upper().isin(
            known_suffixes
        )

        # Apply the function only to the rows that match the mask
        df.loc[mask, "PREFERRED_NAME"] = df.loc[mask, "PREFERRED_NAME"].apply(
            capitalize_name_with_exceptions
        )

        # Nullify preferred name only if it's an exact match for the first name or first name and last name, and not a suffix
        df.loc[
            (
                (df["PREFERRED_NAME"] == df["FIRSTNAME"])
                | (
                    df["PREFERRED_NAME"]
                    == df["FIRSTNAME"].astype(str) + " " + df["LASTNAME"].astype(str)
                )
            )
            & (df["PREFERRED_NAME"].notna())
            & (~df["PREFERRED_NAME"].str.upper().isin(known_suffixes)),
            "PREFERRED_NAME",
        ] = np.nan

    return df


def _remove_test_names(df: pd.DataFrame, test_names: list) -> pd.DataFrame:
    """Removes test names from a DataFrame."""
    logger.debug("Removing test names")
    return df[
        ~df.apply(lambda row: f"{row.FIRSTNAME} {row.LASTNAME}" in test_names, axis=1)
    ]


def _map_insurance_names(clients: pd.DataFrame) -> pd.DataFrame:
    """Maps insurance company names to their corresponding internal names."""
    logger.debug("Mapping insurance names")
    insurance_mapping = {
        "Molina Healthcare of South Carolina": "Molina",
        "Molina Marketplace of South Carolina": "MolinaMarketplace",
        "Marketplace (Molina) of South Carolina": "MolinaMarketplace",
        "Humana Behavioral Health (formerly LifeSynch)": "Humana",
        "Absolute Total Care - Medical": "ATC",
        "Select Health of South Carolina": "SH",
        "Healthy Blue South Carolina": "HB",
        "BabyNet (Combined DA and Eval)": "BabyNet",
        "Meritain Health Aetna": "Aetna",
        "Aetna Health, Inc.": "Aetna",
        "TriCare East": "Tricare",
        "United Healthcare/OptumHealth / OptumHealth Behavioral Solutions": "United_Optum",
        "United Healthcare": "United_Optum",
        "All Savers Alternate Funding-UHC": "United_Optum",
        "UMR (UHC)": "United_Optum",
        "GEHA UnitedHealthcare Shared Services (UHSS)": "United_Optum",
        "Oxford-UHC": "United_Optum",
        "Surest Health Plan (UHC)": "United_Optum",
        "Medicaid South Carolina": "SCM",
    }
    return clients.replace({"INSURANCE_COMPANYNAME": insurance_mapping})


def _consolidate_by_id(clients: pd.DataFrame) -> pd.DataFrame:
    """Consolidates a DataFrame of clients by their IDs. It will group by client ID and merge the insurance company names into separate columns for primary and secondary insurance. For primary insurance, it gets the most recent policy that is currently active (in date). For secondary insurance, it gets all policies that are currently active."""
    logger.debug("Consolidating clients by ID")
    df = clients.copy()

    current_date = pd.Timestamp.now().normalize()

    # Coercing errors will turn unparseable dates into NaT (Not a Time)
    df["POLICY_STARTDATE"] = pd.to_datetime(df["POLICY_STARTDATE"], errors="coerce")
    df["POLICY_ENDDATE"] = pd.to_datetime(df["POLICY_ENDDATE"], errors="coerce")

    # Drop rows where start date is invalid, as they are unusable
    df.dropna(subset=["POLICY_STARTDATE"], inplace=True)

    # Use INSURANCE_COMPANYNAME if available, otherwise fall back to POLICY_COMPANYNAME
    df["COMPANY_NAME"] = np.where(
        df["INSURANCE_COMPANYNAME"].notna(),
        df["INSURANCE_COMPANYNAME"],
        df["POLICY_COMPANYNAME"],
    )

    # Determine all active policies
    is_active = (df["POLICY_STARTDATE"] <= current_date) & (
        df["POLICY_ENDDATE"].isna() | (df["POLICY_ENDDATE"] >= current_date)
    )
    active_policies = df[is_active].copy()

    primary_ins = active_policies[active_policies["POLICY_TYPE"] == "PRIMARY"].copy()
    primary_ins.sort_values("POLICY_STARTDATE", ascending=False, inplace=True)
    most_recent_primary = primary_ins.drop_duplicates(subset="CLIENT_ID", keep="first")
    primary_final = most_recent_primary[["CLIENT_ID", "COMPANY_NAME"]].rename(
        columns={"COMPANY_NAME": "PRIMARY_INSURANCE_COMPANYNAME"}
    )

    secondary_ins = active_policies[
        active_policies["POLICY_TYPE"] == "SECONDARY"
    ].copy()

    # Group by client and aggregate the unique company names into a list
    secondary_final = (
        secondary_ins.groupby("CLIENT_ID")["COMPANY_NAME"]
        .agg(lambda x: list(x.unique()))
        .reset_index()
        .rename(columns={"COMPANY_NAME": "SECONDARY_INSURANCE_COMPANYNAME"})
    )

    clients["PRECERT_EXPIREDATE"] = pd.to_datetime(
        clients["PRECERT_EXPIREDATE"], errors="coerce"
    )

    # Get the latest (max) non-null date for each client
    precert_dates = (
        clients.dropna(subset=["PRECERT_EXPIREDATE"])
        .groupby("CLIENT_ID")["PRECERT_EXPIREDATE"]
        .max()
        .reset_index()
    )

    private_pay = clients.groupby("CLIENT_ID")["POLICY_PRIVATEPAY"].any().reset_index()

    calculated_cols = [
        "POLICY_TYPE",
        "POLICY_STARTDATE",
        "POLICY_ENDDATE",
        "INSURANCE_COMPANYNAME",
        "POLICY_COMPANYNAME",
        "PRECERT_EXPIREDATE",
        "POLICY_PRIVATEPAY",
    ]

    client_base_info = clients.drop(
        columns=calculated_cols, errors="ignore"
    ).drop_duplicates(subset="CLIENT_ID", keep="first")

    consolidated = pd.merge(client_base_info, primary_final, on="CLIENT_ID", how="left")
    consolidated = pd.merge(consolidated, secondary_final, on="CLIENT_ID", how="left")
    consolidated = pd.merge(consolidated, precert_dates, on="CLIENT_ID", how="left")
    consolidated = pd.merge(consolidated, private_pay, on="CLIENT_ID", how="left")

    return consolidated


def _combine_address_info(clients: pd.DataFrame) -> pd.DataFrame:
    """Combines address information from a DataFrame of clients into a single column.

    Expects a DataFrame with columns for the client ID, address parts (USER_ADDRESS_ADDRESS1, USER_ADDRESS_ADDRESS2, USER_ADDRESS_ADDRESS3), city (USER_ADDRESS_CITY), state (USER_ADDRESS_STATE), and zip (USER_ADDRESS_ZIP).

    Returns a DataFrame with the same columns as the input, but with an additional column "ADDRESS" containing the combined address information.
    """

    def _combine_address(client) -> NAType | str:
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
            address = pd.NA

        return address

    logger.debug("Combining client address info")
    clients["ADDRESS"] = clients.apply(_combine_address, axis=1)

    return clients


def _remove_invalid_clients(clients_df: pd.DataFrame) -> pd.DataFrame:
    """Removes clients with invalid IDs."""
    logger.debug("Removing clients with invalid IDs")
    clients_df = clients_df[pd.notna(clients_df["CLIENT_ID"])]
    return clients_df


def get_clients() -> pd.DataFrame:
    """Downloads CSVs from TherapyAppointment, cleans them, and returns a DataFrame of clients."""
    if not os.getenv("DEV_TOGGLE"):
        download_csvs()
    logger.debug("Getting clients from spreadsheets")
    insurance_df = utils.spreadsheets.open_local("temp/input/clients-insurance.csv")
    demo_df = utils.spreadsheets.open_local("temp/input/clients-demographic.csv")

    clients_df = pd.merge(demo_df, insurance_df, "outer")
    clients_df = _normalize_names(clients_df)
    clients_df = _remove_test_names(clients_df, TEST_NAMES)
    # clients_df = _map_insurance_names(clients_df)
    clients_df = _consolidate_by_id(clients_df)
    clients_df = _remove_invalid_clients(clients_df)
    clients_df = _combine_address_info(clients_df)

    return clients_df
