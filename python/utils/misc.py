from datetime import date, datetime
from typing import Any

import pandas as pd
from loguru import logger


def get_column(
    series: pd.Series, column: str, default: Any = None
) -> Any | list[Any] | None:
    """Safely gets a column from a pandas Series, returning a default if the column does not exist or has a NaN value."""
    if column in series:
        value = series[column]

        if isinstance(value, list) and len(value) == 1 and pd.isna(value[0]):
            return default

        if isinstance(value, list):
            return value

        elif pd.notna(value):
            return value

    return default


def get_full_name(firstname: Any, lastname: Any, preferred_name: Any) -> str:
    """Combines first, last, and preferred names into a single string."""
    name_parts = [
        preferred_name,
        f"({firstname})" if firstname and preferred_name else firstname,
        lastname,
    ]

    return " ".join(
        part for part in name_parts if isinstance(part, str) and part
    ).strip()


def format_date(date_str: str | date) -> str | None:
    """Attempts to format a date string or date to 'YYYY-MM-DD'."""
    if isinstance(date_str, date):
        return date_str.strftime("%Y-%m-%d")
    try:
        return datetime.strptime(date_str, "%m/%d/%Y").strftime("%Y-%m-%d")
    except ValueError:
        logger.warning(f"Could not parse date: {date_str}")
        return None


def format_gender(gender_data: Any) -> str | None:
    """Cleans and formats gender data."""
    if not isinstance(gender_data, str) or not gender_data:
        return None
    return gender_data.title().split(".")[-1]


def get_boolean_value(row, column_name, default=False) -> bool:
    """Safely gets a boolean value for a column."""
    value = get_column(row, column_name, default)
    if isinstance(value, str):
        return value.lower() == "true"
    return bool(value)


def format_phone_number(phone_number: Any) -> str | None:
    """Formats a phone number to digits, stripping country codes (leading 1)."""
    if not phone_number or pd.isna(phone_number):
        return None

    # Convert to string and strip non-digits
    if isinstance(phone_number, (float, int)):
        # Handle cases like 8035551234.0
        phone_str = f"{phone_number:.0f}"
    else:
        phone_str = str(phone_number)

    digits = "".join(filter(str.isdigit, phone_str))

    if not digits:
        return None

    # Strip leading 1 if it's 11 digits long
    if len(digits) == 11 and digits.startswith("1"):
        return digits[1:]

    return digits
