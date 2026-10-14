"""Building Google API service objects."""

from __future__ import annotations

import google_auth_httplib2
import httplib2
from google.auth.credentials import Credentials
from googleapiclient.discovery import Resource, build

# googleapiclient's default transport has no socket timeout, so a stalled
# connection blocks .execute() forever with no error or log output.
REQUEST_TIMEOUT_SECONDS = 90


def build_google_service(
    api: str,
    version: str,
    creds: Credentials,
    timeout: int = REQUEST_TIMEOUT_SECONDS,
) -> Resource:
    """Build a Google API service whose requests give up after `timeout` seconds."""
    http = google_auth_httplib2.AuthorizedHttp(
        creds, http=httplib2.Http(timeout=timeout)
    )
    return build(api, version, http=http)
