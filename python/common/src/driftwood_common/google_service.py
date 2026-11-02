"""Building Google API service objects."""

from __future__ import annotations

from typing import Any

import google_auth_httplib2
import httplib2
from google.auth.credentials import Credentials
from googleapiclient.discovery import build

# googleapiclient's default transport has no socket timeout, so a stalled
# connection blocks .execute() forever with no error or log output.
REQUEST_TIMEOUT_SECONDS = 90


def build_google_service(
    api: str,
    version: str,
    creds: Credentials,
    timeout: int = REQUEST_TIMEOUT_SECONDS,
) -> Any:
    """Build a Google API service whose requests give up after `timeout` seconds.

    Typed Any because googleapiclient creates its resource methods (files, events,
    spreadsheets, ...) dynamically from the discovery document.
    """
    http = google_auth_httplib2.AuthorizedHttp(
        creds, http=httplib2.Http(timeout=timeout)
    )
    return build(api, version, http=http)
