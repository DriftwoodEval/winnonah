"""
Run this script to authenticate with Google and generate auth_cache/token.json.
Requires auth_cache/credentials.json to be present.
A browser window will open for login - sign in with the Google account used for this app.
Send the resulting auth_cache/token.json back when done.
"""

import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from utils.google import SCOPES

os.makedirs("auth_cache", exist_ok=True)

token_path = "./auth_cache/token.json"
creds_path = "./auth_cache/credentials.json"

if not os.path.exists(creds_path):
    print(
        f"ERROR: {creds_path} not found. Make sure credentials.json is in the auth_cache folder."
    )
    exit(1)

creds = None
if os.path.exists(token_path):
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)

if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
        creds = flow.run_local_server(port=0)

with open(token_path, "w") as f:
    f.write(creds.to_json())

print(f"Done! Send the file at {token_path} back.")
