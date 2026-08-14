# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-auth-oauthlib>=1.2.2",
#     "google-api-python-client>=2.169.0",
# ]
# ///
"""
Run this script to authenticate with Google and generate token.json.

Portable: only needs `uv` installed (https://docs.astral.sh/uv/getting-started/installation/),
not the rest of this repo. Run with:

    uv run get_token.py

Requires credentials.json to be present alongside this script.
A browser window will open for login - sign in with the Google account this token should act as.
Send the resulting token.json back when done.
"""

import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

# Kept in sync with SCOPES in utils/google.py. Duplicated here (rather than
# imported) so this script has no dependency on the rest of the project.
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
]

script_dir = Path(__file__).parent
token_path = script_dir / "token.json"
creds_path = script_dir / "credentials.json"

if not Path.exists(creds_path):
    print(  # noqa: T201
        f"ERROR: {creds_path} not found. Make sure credentials.json is in the same folder as this script."
    )
    sys.exit(1)

creds = None
if Path.exists(token_path):
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)

if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
        creds = flow.run_local_server(port=0)

with Path.open(token_path, "w") as f:
    f.write(creds.to_json())

print(f"Done! Send the file at {token_path} back.")  # noqa: T201
