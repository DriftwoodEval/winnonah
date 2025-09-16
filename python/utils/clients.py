import os
import string

import numpy as np
import pandas as pd
from loguru import logger
from nameparser import HumanName

import utils.database
from utils.download_ta import download_csvs

TEST_NAMES = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Barbara Steele",
]


def normalize_names(df: pd.DataFrame) -> pd.DataFrame:
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
                | (df["PREFERRED_NAME"] == df["FIRSTNAME"] + " " + df["LASTNAME"])
            )
            & (df["PREFERRED_NAME"].notna())
            & (~df["PREFERRED_NAME"].str.upper().isin(known_suffixes)),
            "PREFERRED_NAME",
        ] = np.nan

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
        "Molina Marketplace of South Carolina": "MolinaMarketplace",
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
    """Consolidates a DataFrame of clients by their IDs. It will group by client ID and merge the insurance company names into separate columns for primary and secondary insurance. For primary insurance, it gets the most recent policy that is currently active (in date). For secondary insurance, it gets all policies that are currently active."""

    def _convert_dates(df: pd.DataFrame) -> pd.DataFrame:
        """Convert date columns to datetime, handling invalid dates."""
        df = df.copy()
        for col in ["POLICY_STARTDATE", "POLICY_ENDDATE"]:
            if col in df.columns:
                try:
                    df[col] = pd.to_datetime(
                        df[col], format="%m/%d/%Y", errors="coerce"
                    )
                except:
                    df[col] = pd.to_datetime(df[col], errors="coerce")
        return df.dropna(subset=["POLICY_STARTDATE"])

    def _filter_active_policies(
        df: pd.DataFrame, current_date: pd.Timestamp
    ) -> pd.DataFrame:
        """Filter policies that are currently active (in date)."""
        if "POLICY_ENDDATE" in df.columns:
            return df[
                (df["POLICY_STARTDATE"] <= current_date)
                & (
                    (df["POLICY_ENDDATE"].isna())
                    | (df["POLICY_ENDDATE"] >= current_date)
                )
            ]
        else:
            return df[df["POLICY_STARTDATE"] <= current_date]

    def _merge_insurance(group: pd.DataFrame) -> pd.Series:
        merged_row = group.iloc[0].copy()
        current_date = pd.Timestamp.now().normalize()

        # Process primary insurance - get most recent active policy
        primary_policies = group[group["POLICY_TYPE"] == "PRIMARY"].dropna(
            subset=["INSURANCE_COMPANYNAME", "POLICY_COMPANYNAME"]
        )
        if not primary_policies.empty:
            primary_policies = _convert_dates(primary_policies)
            active_primary = _filter_active_policies(primary_policies, current_date)
            if not active_primary.empty:
                most_recent = active_primary.sort_values(
                    "POLICY_STARTDATE", ascending=False
                ).iloc[0]
                merged_row["PRIMARY_INSURANCE_COMPANYNAME"] = (
                    most_recent["INSURANCE_COMPANYNAME"]
                    if pd.notna(most_recent["INSURANCE_COMPANYNAME"])
                    else most_recent["POLICY_COMPANYNAME"]
                )
            else:
                merged_row["PRIMARY_INSURANCE_COMPANYNAME"] = None
        else:
            merged_row["PRIMARY_INSURANCE_COMPANYNAME"] = None

        # Process secondary insurance - get all active policies
        secondary_policies = group[group["POLICY_TYPE"] == "SECONDARY"].dropna(
            subset=["INSURANCE_COMPANYNAME", "POLICY_COMPANYNAME"]
        )

        if not secondary_policies.empty:
            secondary_policies = _convert_dates(secondary_policies)
            active_secondary = _filter_active_policies(secondary_policies, current_date)

            if not active_secondary.empty:
                secondary_companies = (
                    active_secondary["INSURANCE_COMPANYNAME"].unique().tolist()
                )
                # Check for empty secondary insurance company names
                for idx, company in enumerate(secondary_companies):
                    if pd.isna(company):
                        secondary_companies[idx] = active_secondary.iloc[idx][
                            "POLICY_COMPANYNAME"
                        ]
                merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = list(
                    set(secondary_companies)
                )  # Remove duplicates
            else:
                merged_row["SECONDARY_INSURANCE_COMPANYNAME"] = None
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
    """Removes clients with invalid IDs."""
    logger.debug("Removing clients with invalid IDs")
    clients_df = clients_df[pd.notna(clients_df["CLIENT_ID"])]
    return clients_df


def get_clients() -> pd.DataFrame:
    """Downloads CSVs from TherapyAppointment, cleans them, and returns a DataFrame of clients."""
    if not os.getenv("DEV_TOGGLE"):
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

    return clients_df
