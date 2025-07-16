import os
import re
from urllib.parse import urlparse

from loguru import logger


def validate_config() -> None:
    if not (database_url := os.getenv("DATABASE_URL")) or not urlparse(database_url):
        raise ValueError(
            f"Invalid DATABASE_URL. Must be a valid URL. Got {database_url}"
        )

    if not os.getenv("PROVIDER_CREDENTIALING_ID"):
        raise ValueError("PROVIDER_CREDENTIALING_ID is not set")

    if not os.getenv("PROVIDER_CREDENTIALING_RANGE"):
        raise ValueError("PROVIDER_CREDENTIALING_RANGE is not set")

    if not re.match(
        r"^[\w\s]+![A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$",
        os.getenv("PROVIDER_CREDENTIALING_RANGE") or "",
    ):
        raise ValueError(
            f"Invalid Google Sheets range format. Must be, e.g. 'Sheet1!A1:B2'. Got: {os.getenv('PROVIDER_CREDENTIALING_RANGE')}"
        )

    if not re.match(
        r"^(?:[A-Z]+:[-0-9.]+,[-0-9.]+,[a-zA-Z ]+;?)+$",
        os.getenv("OFFICE_ADDRESSES") or "",
    ):
        raise ValueError(
            f"Invalid office addresses format. Must be, e.g. 'LOC:12.0087995,-8.0545544,Pretty Name;LOC2:14.8079196,-7.7155156,Pretty Name 2'. Got: {os.getenv('OFFICE_ADDRESSES')}"
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
