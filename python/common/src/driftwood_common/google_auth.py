"""Google OAuth credentials for the Python projects.

Each project calls `authenticate` with its own scopes and file locations, and
keeps the returned credentials in memory for the rest of the process.
"""

from __future__ import annotations

import os
import time
from collections.abc import Sequence
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from loguru import logger

REFRESH_ATTEMPTS = 3


def authenticate(
    scopes: Sequence[str],
    credentials_path: str | Path,
    token_path: str | Path,
    *,
    creds: Credentials | None = None,
    require_exact_scopes: bool = False,
    refresh_attempts: int = REFRESH_ATTEMPTS,
) -> Credentials:
    """Return valid Google credentials, refreshing or logging in as needed.

    Reads the saved token from `token_path`, or starts from `creds` if the
    caller already holds some. An expired token is refreshed, retrying a few
    times with a short backoff because a failure is usually a network blip.
    If that fails, a browser login runs with the client secrets from
    `credentials_path`. The token file is rewritten whenever the credentials
    changed.

    With `require_exact_scopes`, a saved token whose scopes differ from
    `scopes` is discarded and the user logs in again.

    On a headless host (the `HEADLESS` environment variable is "true") the
    browser login is not possible, so this raises instead of waiting forever.
    """
    token_path = Path(token_path)

    if creds is None and token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), list(scopes))
        if require_exact_scopes and set(creds.scopes or []) != set(scopes):
            logger.info("Scopes have changed, re-authenticating...")
            creds = None

    if creds and creds.valid:
        return creds

    refreshed = False
    if creds and creds.expired and creds.refresh_token:
        for attempt in range(refresh_attempts):
            try:
                creds.refresh(Request())
                refreshed = True
                break
            except RefreshError as e:
                logger.warning(f"Token refresh attempt {attempt + 1} failed: {e}")
                if attempt < refresh_attempts - 1:
                    time.sleep(2**attempt)
        if not refreshed:
            logger.warning("Token refresh failed, falling back to manual login")

    if not refreshed:
        if os.getenv("HEADLESS") == "true":
            raise RuntimeError(
                "Google credentials are invalid and interactive login is "
                f"unavailable on a headless host. Refresh {token_path} from an "
                "interactive machine and redeploy."
            )
        flow = InstalledAppFlow.from_client_secrets_file(
            str(credentials_path), list(scopes)
        )
        creds = flow.run_local_server(port=0)

    assert creds is not None
    token_path.write_text(creds.to_json())
    return creds
