import os
import re

import asana
from asana.rest import ApiException
from loguru import logger


def init() -> asana.ProjectsApi:
    logger.debug("Initializing Asana")
    configuration = asana.Configuration()
    ASANA_TOKEN = os.environ.get("ASANA_TOKEN")
    if not ASANA_TOKEN:
        raise ValueError("ASANA_TOKEN is not set")
    configuration.access_token = ASANA_TOKEN
    projects_api = asana.ProjectsApi(asana.ApiClient(configuration))
    return projects_api


def get_projects(
    projects_api: asana.ProjectsApi, archived: bool = False
) -> list | None:
    opts = {
        "limit": 100,
        "archived": archived,
        "opt_fields": "archived,name,color,permalink_url,notes",
    }

    logger.debug("Getting Asana projects")
    ASANA_WORKSPACE = os.environ.get("ASANA_WORKSPACE")
    if not ASANA_WORKSPACE:
        raise ValueError("ASANA_WORKSPACE is not set")
    try:
        api_response = list(
            projects_api.get_projects_for_workspace(
                ASANA_WORKSPACE,
                opts,  # pyright: ignore (asana api is strange)
            )
        )
        return api_response

    except ApiException as e:
        logger.error(
            "Exception when calling ProjectsApi->get_projects_for_workspace: %s\n" % e
        )
        return


def search_by_name(projects: list | None, name: str) -> dict | None:
    if not projects:
        return
    filtered_projects = [
        data
        for data in projects
        if name.lower()
        in re.sub(r"\s+", " ", data["name"].replace('"', "")).strip().lower()
    ]
    project_count = len(filtered_projects)

    correct_project = None

    if project_count == 0:
        logger.warning(f"No projects found for {name}.")
    elif project_count == 1:
        logger.debug(f"Found 1 project for {name}.")
        correct_project = filtered_projects[0]
    else:
        logger.warning(f"Found {project_count} projects for {name}.")
    if correct_project:
        return correct_project
    else:
        return None


def is_asd_adhd(project: dict) -> str:
    both = re.search(
        r"\basd\b.*\badhd\b|\badhd\b.*\basd\b|\basdadhd\b|\badhdasd\b",
        project["name"].lower(),
    )
    adhd = re.search(r"\badhd\b", project["name"].lower())
    if both:
        return "Both"
    elif adhd:
        return "ADHD"
    else:
        return "ASD"


def is_interpreter(project: dict) -> bool:
    if "*i*" in project["name"].lower():
        logger.debug(f"{project['name']} includes interpreter")
        return True
    else:
        return False
