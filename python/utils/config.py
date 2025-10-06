import os
import re
from urllib.parse import urlparse


def validate_config() -> None:
    """Validates the environment variables."""
    required_variables = [
        "DATABASE_URL",
        "PUNCHLIST_ID",
        "PUNCHLIST_RANGE",
        "TA_USERNAME",
        "TA_PASSWORD",
        "EXCLUDED_TA",
        "ASANA_TOKEN",
        "ASANA_WORKSPACE",
        "CENSUS_API_KEY",
        "OPENPHONE_API_TOKEN",
        "FAX_FOLDER_ID",
        "BASE_FOLDER_ID",
    ]

    for variable in required_variables:
        value = os.getenv(variable)
        if not value:
            raise ValueError(f"{variable} is not set")

    if not urlparse(os.getenv("DATABASE_URL")):
        raise ValueError(
            f"Invalid DATABASE_URL. Must be a valid URL. Got: {os.getenv('DATABASE_URL')}"
        )

    if not re.match(
        r"^[\w\s]+![A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$",
        os.getenv("PUNCHLIST_RANGE") or "",
    ):
        raise ValueError(
            f"Invalid Google Sheets range format. Must be, e.g. 'Sheet1!A1:B2'. Got: {os.getenv('PUNCHLIST_RANGE')}"
        )

    if not re.match(r"^([^,]+(?:,[^,]+)*)$", os.getenv("EXCLUDED_TA") or ""):
        raise ValueError(
            f"Invalid EXCLUDED_TA format. Must be comma-separated values, e.g. 'Jane Smith,John Doe'. Got: {os.getenv('EXCLUDED_TA')}"
        )
