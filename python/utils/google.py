import os

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from loguru import logger

load_dotenv()

PROVIDER_CREDENTIALING_ID = os.getenv("PROVIDER_CREDENTIALING_ID")
PROVIDER_CREDENTIALING_RANGE = os.getenv("PROVIDER_CREDENTIALING_RANGE")

### GOOGLE AUTH
# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def get_creds():
    creds = None
    logger.debug("Checking if Google token exists")
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists("auth_cache/token.json"):
        logger.debug("Google token exists")
        creds = Credentials.from_authorized_user_file("auth_cache/token.json", SCOPES)
    # If there are no (valid) credentials available, let the user log in.
    logger.debug("Checking if Google credentials are valid")
    if not creds or not creds.valid:
        logger.warning("Google credentials are not valid")
        if creds and creds.expired and creds.refresh_token:
            logger.debug("Refreshing credentials")
            creds.refresh(Request())
        else:
            logger.debug("Running local auth server")
            flow = InstalledAppFlow.from_client_secrets_file(
                "auth_cache/credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        logger.debug("Saving Google credentials")
        with open("auth_cache/token.json", "w") as token:
            token.write(creds.to_json())
    else:
        logger.debug("Google credentials are valid")
    return creds


def get_evaluators() -> dict:
    creds = get_creds()

    logger.debug("Getting evaluators from Google Sheets")

    service = build("sheets", "v4", credentials=creds)

    # Call the Sheets API
    sheet = service.spreadsheets()
    result = (
        sheet.values()
        .get(
            spreadsheetId=PROVIDER_CREDENTIALING_ID,
            range=PROVIDER_CREDENTIALING_RANGE,
        )
        .execute()
    )
    values = result.get("values", [])

    header_row = values[0]
    data_rows = values[2:]

    evaluators = {}

    # Find the indices of the provider names
    provider_name_indices = {
        name.strip(): i for i, name in enumerate(header_row) if name.strip()
    }

    keys_to_extract = [row[0] for row in data_rows]

    for provider_name, col_index in provider_name_indices.items():
        if (
            col_index > 2
        ):  # Skip the first three columns ('', '# of appointments needed', 'Prior Auth')
            if (
                "-term" in provider_name or "-reports" in provider_name
            ):  # Skip evaluators that have been terminated or quit, and report writers
                continue

            provider_data = {}
            replacements = str.maketrans({" ": "", "/": "_", "-": "_"})

            for i, key in enumerate(keys_to_extract):
                if key.lower().startswith("united/optum"):
                    key = "United/Optum"
                key = key.translate(replacements).strip()
                try:
                    value = data_rows[i][col_index].strip()
                    if (
                        key == "Email"
                        or key == "NPI"
                        or key == "DistrictInfo"
                        or key == "Offices"
                    ):
                        provider_data[key] = value
                        continue
                    if value.upper() == "X":
                        provider_data[key] = True
                    elif value.lower() == "denied":
                        provider_data[key] = False
                    elif "/" in value:
                        provider_data[key] = False
                    elif value:
                        provider_data[key] = True
                    else:
                        provider_data[key] = False
                except IndexError:
                    provider_data[key] = False

            evaluators[provider_name.strip()] = provider_data

    return evaluators
