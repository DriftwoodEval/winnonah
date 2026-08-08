import os
import sys
import time

import pandas as pd
import requests
from loguru import logger
from tqdm import tqdm

from utils.clients import _normalize_names, _remove_test_names

API_TOKEN = os.getenv("OPENPHONE_API_TOKEN", "")


def _get_all_quo_contacts():
    """Retrieve all contacts from Quo into a dataframe."""
    url = "https://api.quo.com/v1/contacts"
    headers = {"Authorization": API_TOKEN}
    params = {
        "maxResults": 50,
    }
    all_contacts_data = []
    page_token = None
    spinner_chars = ["-", "\\", "|", "/"]
    i = 0

    logger.info("Fetching Quo contacts... ", end="")
    sys.stdout.flush()

    while True:
        try:
            spinner = spinner_chars[i % len(spinner_chars)]
            status_text = (
                f"Fetching contacts... {spinner} (Found: {len(all_contacts_data)})"
            )
            sys.stdout.write("\r" + status_text)
            sys.stdout.flush()
            i += 1

            if page_token:
                params["pageToken"] = page_token
            response = requests.get(url, headers=headers, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            contacts_on_page = data.get("data", [])
            if contacts_on_page:
                all_contacts_data.extend(contacts_on_page)

            page_token = data.get("nextPageToken")
            if not page_token:
                break
            time.sleep(0.1)
        except requests.exceptions.RequestException as err:
            sys.stdout.write("\r" + " " * 50 + "\r")
            logger.error(f"\nAPI request error: {err}")
            return None

    sys.stdout.write("\r" + " " * 50 + "\r")
    logger.info(
        f"Finished fetching. Found a total of {len(all_contacts_data)} Quo contacts."
    )

    # --- Convert API JSON to a structured DataFrame ---
    processed_records = []
    for contact in all_contacts_data:
        # Extract the first phone number, if it exists
        phone_numbers = contact.get("defaultFields", {}).get("phoneNumbers", [])
        phone_number_1 = phone_numbers[0]["value"] if phone_numbers else None

        processed_records.append(
            {
                "id": contact.get("id"),
                "firstName": contact.get("defaultFields", {}).get("firstName"),
                "lastName": contact.get("defaultFields", {}).get("lastName"),
                "phone_number_1": phone_number_1,
            }
        )

    return pd.DataFrame(processed_records)


def _normalize_phone_number(phone_series: pd.Series) -> pd.Series:
    """Normalizes a pandas Series of phone numbers to a consistent 11-digit format for NA numbers.

    - Strips non-digits.
    - Prepends '1' to 10-digit numbers.
    """
    # Convert to string and strip all non-digit characters
    cleaned = phone_series.str.replace(r"\D", "", regex=True)

    # Prepend '1' to numbers that are 10 digits long
    # Others (e.g., already 11 digits, international, or malformed) are left as is.
    is_ten_digits = cleaned.str.len() == 10
    cleaned.loc[is_ten_digits] = "1" + cleaned.loc[is_ten_digits]
    return cleaned


def _create_quo_contacts(contacts_df: pd.DataFrame):
    """Creates contacts in Quo from a DataFrame."""
    url = "https://api.quo.com/v1/contacts"
    headers = {"Authorization": API_TOKEN, "Content-Type": "application/json"}
    logger.debug(f"Creating {len(contacts_df)} contacts in Quo...")

    success_count = 0
    error_count = 0

    for _, row in tqdm(
        contacts_df.iterrows(), total=len(contacts_df), desc="Creating Contacts"
    ):
        payload = {
            "defaultFields": {
                "firstName": row["FIRSTNAME"],
                "lastName": row["LASTNAME"],
                "phoneNumbers": [{"value": f"+1{row['PHONE_NUMBER']}"}],
            },
            "source": "winnonah",
            "externalId": row["CLIENT_ID"],
        }
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            success_count += 1
        except requests.exceptions.RequestException as err:
            tqdm.write(
                f"  [ERROR] Failed to create contact {row['FIRSTNAME']} {row['LASTNAME']}: {err}"
            )
            tqdm.write(
                f"  Response: {err.response.text if err.response else 'No response'}"
            )
            error_count += 1

    logger.info(
        f"\nSync complete. Successfully created: {success_count}, Failed: {error_count}"
    )


def _process_demographic_data(
    demo_df: pd.DataFrame, quo_df: pd.DataFrame
) -> pd.DataFrame:
    """Process demographic data by cleaning, filtering, and removing duplicates."""
    if demo_df is None or quo_df is None:
        return pd.DataFrame()

    initial_count = len(demo_df)
    logger.info(f"Processing TA demographic data. Initial count: {initial_count}")

    active_df = demo_df[demo_df["STATUS"] != "Inactive"].copy()
    logger.debug(f"Removed {len(demo_df) - len(active_df)} inactive clients.")

    filtered_df = _remove_test_names(active_df)

    filtered_df = _normalize_names(filtered_df)

    # Create a boolean mask for rows where PREFERRED_NAME is valid and should be used.
    preferred_name_mask = pd.notna(filtered_df["PREFERRED_NAME"]) & (
        filtered_df["PREFERRED_NAME"] != ""
    )
    # Use the mask with .loc to update the 'FIRSTNAME' column in the original DataFrame.
    filtered_df.loc[preferred_name_mask, "FIRSTNAME"] = filtered_df.loc[
        preferred_name_mask, "PREFERRED_NAME"
    ]

    logger.debug("Cleaning phone numbers...")
    quo_df.loc[:, "phone_normalized"] = _normalize_phone_number(
        quo_df["phone_number_1"]
    )
    filtered_df.loc[:, "phone_normalized"] = _normalize_phone_number(
        filtered_df["PHONE1"]
    )

    op_phones_normalized = set(quo_df["phone_normalized"].dropna())

    final_df = filtered_df[
        ~filtered_df["phone_normalized"].isin(op_phones_normalized)
    ].copy()

    duplicates_removed = len(filtered_df) - len(final_df)
    logger.debug(
        f"Removed {duplicates_removed} clients with phone numbers already in Quo."
    )

    logger.info(f"Final client count: {len(final_df)}")

    return final_df.rename(columns={"PHONE1": "PHONE_NUMBER"})


def sync_quo():
    """Sync Quo contacts with TA demographic data."""
    logger.info("Syncing Quo contacts...")
    demo_df = pd.read_csv("temp/input/clients-demographic.csv", dtype=str)

    quo_df = _get_all_quo_contacts()

    if quo_df is None:
        logger.error("Failed to fetch Quo contacts. Skipping Quo sync.")
        return

    final_df = _process_demographic_data(demo_df, quo_df)

    if final_df is not None:
        final_df.to_csv("temp/input/quo-merged.csv", index=False)
        # We would import the CSV into Quo here, but it doesn't show contacts in Quo until a conversation has been started with them, which is pretty useless.
        logger.success("Quo CSV created.")
    else:
        logger.error("Failed to process Quo data. Skipping Quo sync.")
