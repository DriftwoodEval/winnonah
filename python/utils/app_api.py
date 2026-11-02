"""Calls to the web app's internal API, authenticated with API_KEY."""

import os

import requests
from loguru import logger

REQUEST_TIMEOUT_SECONDS = 30


def app_url() -> str:
    """The web app's base URL, without a trailing slash."""
    return os.getenv("EMR_APP_URL", "https://emr.driftwoodeval.com").rstrip("/")


def get_users_with_permission(permission: str, email: str | None = None) -> list[dict]:
    """Active users who hold a permission, through their role or their own overrides.

    The web app decides who holds it, so the permission rules live in one place.
    Each user has `email`, `name`, `claimedReportFolder`, and `blockedEvaluatorNpis`.
    `email` narrows the result to that one user.
    """
    api_key = os.getenv("API_KEY")
    if not api_key:
        raise RuntimeError("API_KEY is not set, cannot look up users by permission")

    params = {"permission": permission}
    if email:
        params["email"] = email
    response = requests.get(
        f"{app_url()}/api/internal/users-with-permission",
        params=params,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def get_queue_notify_users() -> list[dict]:
    """Users who want report queue notifications and have no active claimed report."""
    users = get_users_with_permission("reports:notifications")
    logger.debug(f"{len(users)} users have report notifications on")
    return [user for user in users if not user["claimedReportFolder"]]


def get_exclusion_check_notify_users() -> list[dict]:
    """Users who receive exclusion check results."""
    return get_users_with_permission("settings:exclusion-check:notifications")
