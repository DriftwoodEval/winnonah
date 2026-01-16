import os
import re
from typing import Final
from urllib.parse import urlparse

# Required environment variables and their validation patterns/logic
REQUIRED_VARS: Final = {
    "DATABASE_URL": lambda x: bool(urlparse(x).scheme),
    "PUNCHLIST_ID": None,
    "PUNCHLIST_RANGE": lambda x: bool(
        re.match(r"^[\w\s]+![A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$", x)
    ),
    "TA_USERNAME": None,
    "TA_PASSWORD": None,
    "EXCLUDED_TA": lambda x: bool(re.match(r"^([^,]+(?:,[^,]+)*)$", x)),
    "ASANA_TOKEN": None,
    "ASANA_WORKSPACE": None,
    "CENSUS_API_KEY": None,
    "OPENPHONE_API_TOKEN": None,
    "FAX_FOLDER_ID": None,
    "BASE_FOLDER_ID": None,
    "ERROR_EMAILS": None,
}


def validate_config() -> None:
    """Validates the environment variables against required rules."""
    for var, validator in REQUIRED_VARS.items():
        value = os.getenv(var)
        if not value:
            raise ValueError(f"Environment variable {var} is not set.")

        if validator and not validator(value):
            error_msgs = {
                "DATABASE_URL": f"Invalid DATABASE_URL format. Got: {value}",
                "PUNCHLIST_RANGE": f"Invalid Google Sheets range format. Must be, e.g. 'Sheet1!A1:B2'. Got: {value}",
                "EXCLUDED_TA": f"Invalid EXCLUDED_TA format. Must be comma-separated values. Got: {value}",
            }
            raise ValueError(error_msgs.get(var, f"Invalid value for {var}: {value}"))
