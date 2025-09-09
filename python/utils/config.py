import os
import re
from urllib.parse import urlparse


def validate_config() -> None:
    """Validates the environment variables."""
    if not (database_url := os.getenv("DATABASE_URL")) or not urlparse(database_url):
        raise ValueError(
            f"Invalid DATABASE_URL. Must be a valid URL. Got {database_url}"
        )

    if not os.getenv("PUNCHLIST_ID"):
        raise ValueError("PUNCHLIST_ID is not set")

    if not os.getenv("PUNCHLIST_RANGE"):
        raise ValueError("PUNCHLIST_RANGE is not set")

    if not re.match(
        r"^[\w\s]+![A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$",
        os.getenv("PUNCHLIST_RANGE") or "",
    ):
        raise ValueError(
            f"Invalid Google Sheets range format. Must be, e.g. 'Sheet1!A1:B2'. Got: {os.getenv('PUNCHLIST_RANGE')}"
        )

    if not os.getenv("TA_USERNAME"):
        raise ValueError("TA_USERNAME is not set")

    if not os.getenv("TA_PASSWORD"):
        raise ValueError("TA_PASSWORD is not set")

    if not re.match(r"^([^,]+(?:,[^,]+)*)$", os.getenv("EXCLUDED_TA") or ""):
        raise ValueError(
            f"Invalid EXCLUDED_TA format. Must be comma-separated values, e.g. 'Jane Smith,John Doe'. Got: {os.getenv('EXCLUDED_TA')}"
        )

    if not os.getenv("ASANA_TOKEN"):
        raise ValueError("ASANA_TOKEN is not set")

    if not os.getenv("ASANA_WORKSPACE"):
        raise ValueError("ASANA_WORKSPACE is not set")

    if not os.getenv("CENSUS_API_KEY"):
        raise ValueError("CENSUS_API_KEY is not set")

    if not os.getenv("OPENPHONE_API_TOKEN"):
        raise ValueError("OPENPHONE_API_TOKEN is not set")
