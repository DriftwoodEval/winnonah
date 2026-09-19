"""Scrapes eligibility data from the SC Medicaid provider portal via Selenium.

Runs as part of the normal cron pipeline (main.py) every CRON_SCHEDULE
interval (every 4 hours by default, see python/Dockerfile), checking clients on
the insurances in MEDICAID_SHORT_NAMES that were never checked or were last
checked more than MEDICAID_RECHECK_DAYS ago. A full recheck of a specific
client, or of every client, can be forced with
`python main.py --medicaid [--client <name-or-id>]`. Portal credentials
come from the medicaid entry in the app's services config (Settings >
QSuite tab), not from environment variables.
"""

from time import sleep

from loguru import logger
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver import ActionChains, Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import Select

import utils.database
import utils.webdriving as w
from utils.task_tracker import track_task

BASE_PORTAL_URL = "https://portal.scmedicaid.com"


def login_medicaid(driver: WebDriver, actions: ActionChains) -> None:
    """Log in to SC Medicaid Portal."""
    logger.info("Logging in to SC Medicaid")

    services = utils.database.get_services_config()
    medicaid = services.get("medicaid", {})
    medicaid_username = medicaid.get("username")
    medicaid_password = medicaid.get("password")
    if not medicaid_username or not medicaid_password:
        raise ValueError("Medicaid credentials not found in database config")

    username_field = w.find_element(driver, By.NAME, "username")
    username_field.send_keys(medicaid_username)

    password_field = w.find_element(driver, By.NAME, "password")
    password_field.send_keys(medicaid_password)

    actions.send_keys(Keys.ENTER)
    actions.perform()

    try:
        w.find_element(
            driver, By.XPATH, "//*[contains(text(), 'Eligibility')]", timeout=15
        )
    except (NoSuchElementException, TimeoutException) as e:
        raise RuntimeError(
            "SC Medicaid login failed, authenticated page did not load"
        ) from e


def check_and_login_medicaid(first_time: bool = False) -> WebDriver:
    """Ensure logged in to SC Medicaid Portal and return the driver."""
    driver, actions = w.initialize_selenium()
    medicaid_url = f"{BASE_PORTAL_URL}/provider/home"
    if first_time:
        logger.debug("First time login to SC Medicaid Portal, logging in now.")
        driver.get(medicaid_url)
        login_medicaid(driver, actions)
    else:
        try:
            logger.debug("Checking if logged in to SC Medicaid Portal")
            driver.get(medicaid_url)
            w.find_element(
                driver, By.XPATH, "//*[contains(text(), 'Eligibility')]", timeout=2
            )
            logger.debug("Already logged in to SC Medicaid Portal")
        except (NoSuchElementException, TimeoutException):
            logger.debug("Not logged in to SC Medicaid Portal, logging in now.")
            login_medicaid(driver, actions)

    select_provider(driver, "1669135125")
    return driver


def lookup_due_medicaid_eligibility() -> None:
    """Look up eligibility for clients never checked or not checked in the last month."""
    _run_medicaid_eligibility_lookup(only_due=True)


def lookup_medicaid_eligibility(
    only_due: bool = False,
    names: list[str] | None = None,
    client_ids: list[str] | None = None,
) -> None:
    """Force eligibility lookup for all Medicaid-portal clients, or filter by name/ID strings."""
    _run_medicaid_eligibility_lookup(
        only_due=only_due, names=names, client_ids=client_ids
    )


def _ensure_logged_in(driver: WebDriver) -> None:
    """Re-login if the current SC Medicaid session has expired."""
    try:
        driver.get(f"{BASE_PORTAL_URL}/provider/home")
        w.find_element(
            driver, By.XPATH, "//*[contains(text(), 'Eligibility')]", timeout=5
        )
    except (NoSuchElementException, TimeoutException):
        logger.info("SC Medicaid session expired, re-logging in")
        login_medicaid(driver, ActionChains(driver))
        select_provider(driver, "1669135125")


def _run_medicaid_eligibility_lookup(
    only_due: bool,
    names: list[str] | None = None,
    client_ids: list[str] | None = None,
) -> None:
    clients = utils.database.get_medicaid_clients_with_ids(only_due=only_due)

    if client_ids:
        str_ids = {str(cid) for cid in client_ids}
        clients = [c for c in clients if str(c["id"]) in str_ids]

    if names:

        def _matches_name(client: dict) -> bool:
            full = f"{client['firstName']} {client['lastName']}".lower()
            return any(n.lower() in full for n in names)

        clients = [c for c in clients if _matches_name(c)]

    if not clients:
        logger.info("No clients to check eligibility for")
        return

    logger.info(f"Looking up eligibility for {len(clients)} client(s)")
    try:
        driver = check_and_login_medicaid(first_time=True)
    except Exception:
        logger.warning("Initial SC Medicaid login failed, retrying in 60s")
        sleep(60)
        driver = check_and_login_medicaid(first_time=True)

    try:
        with track_task(
            "medicaid_eligibility_lookup", "Looking up SC Medicaid eligibility"
        ) as task:
            if task is None:
                logger.info(
                    "Skipping run: a previous SC Medicaid eligibility lookup is still in progress."
                )
                return

            total = len(clients)
            for i, client in enumerate(clients, start=1):
                task.progress(i, total)
                medicaid_id = client["insuranceNumber"]
                try:
                    eligibility = search_single_client(driver, medicaid_id)
                except (NoSuchElementException, TimeoutException):
                    logger.warning(
                        f"Error searching client {medicaid_id}, verifying login and retrying"
                    )
                    _ensure_logged_in(driver)
                    try:
                        eligibility = search_single_client(driver, medicaid_id)
                    except (NoSuchElementException, TimeoutException):
                        logger.warning(
                            f"Client {medicaid_id} not found after re-login, marking as checked"
                        )
                        eligibility = None
                    except Exception:
                        logger.error(
                            f"Failed to look up eligibility for client {medicaid_id} after re-login, skipping"
                        )
                        continue
                utils.database.update_client_medicaid_eligibility(
                    client["id"], eligibility
                )
    finally:
        logout_medicaid(driver)


def logout_medicaid(driver: WebDriver) -> None:
    """Log out of SC Medicaid Portal."""
    logger.info("Logging out of SC Medicaid")
    driver.get(f"{BASE_PORTAL_URL}/logoff")
    sleep(1)


def select_provider(driver: WebDriver, provider_value: str) -> None:
    """Select a provider from the header prompt form."""
    dropdown = w.find_element(driver, By.ID, "providerID2", timeout=3)
    logger.info("Selecting provider")
    Select(dropdown).select_by_value(provider_value)
    w.click_element(driver, By.ID, "update")


def _open_query_form(driver: WebDriver, max_attempts: int = 3) -> WebElement:
    """Load the single-query page and return the Medicaid ID input.

    Right after login the provider selection can still be settling, in which
    case the form is missing. Reloading the page gives it time to finish.
    """
    url = f"{BASE_PORTAL_URL}/eligibility/entersinglequery"
    for attempt in range(1, max_attempts):
        driver.get(url)
        try:
            return w.find_element(driver, By.NAME, "MedicaidID")
        except TimeoutException:
            logger.warning(
                f"Medicaid ID form not found (attempt {attempt}/{max_attempts}), reloading"
            )
    driver.get(url)
    return w.find_element(driver, By.NAME, "MedicaidID")


def search_single_client(driver: WebDriver, client_id: str) -> dict[str, str | None]:
    """Search for a single client in SC Medicaid Portal and return the scraped fields."""
    logger.info(f"Searching for client {client_id}")
    _open_query_form(driver).send_keys(client_id)
    w.click_element(driver, By.NAME, "checkEligibilityButton")
    w.click_element(driver, By.NAME, "displayButton1")
    qual_category = w.find_element(
        driver, By.XPATH, "//li[label[text()='Qual. Category:']]/p"
    )
    payment_category = w.find_element(
        driver, By.XPATH, "//li[label[text()='Payment Category:']]/p"
    )
    # The page has loaded by now, so optional fields are read without waiting.
    organization = driver.find_elements(
        By.XPATH, "//td[normalize-space()='Organization:']/following-sibling::td[1]"
    )
    carriers = driver.find_elements(
        By.XPATH,
        "//td[contains(normalize-space(), 'Carrier')]/following-sibling::td[1]",
    )
    return {
        "qualCategory": qual_category.text,
        "paymentCategory": payment_category.text,
        "medicaidOrganization": organization[0].text if organization else None,
        "medicaidCarrier1": carriers[0].text if len(carriers) > 0 else None,
        "medicaidCarrier2": carriers[1].text if len(carriers) > 1 else None,
    }


def preview_medicaid_lookup(medicaid_id: str) -> None:
    """Log in, search one Medicaid ID, and log every label/value pair on the results page.

    Writes nothing to the database. Use it to check what the portal shows and
    that search_single_client's labels match.
    """
    driver = check_and_login_medicaid(first_time=True)
    try:
        eligibility = search_single_client(driver, medicaid_id)
        logger.info(f"Scraped: {eligibility}")
        logger.info("All label/value pairs on the page:")
        for item in driver.find_elements(By.XPATH, "//li[label]"):
            label = item.find_element(By.XPATH, "./label").text
            value = "".join(p.text for p in item.find_elements(By.XPATH, "./p"))
            logger.info(f"  {label!r}: {value!r}")
        for row in driver.find_elements(By.XPATH, "//tr[count(td)=2]"):
            cells = row.find_elements(By.XPATH, "./td")
            logger.info(f"  {cells[0].text!r}: {cells[1].text!r}")
    finally:
        logout_medicaid(driver)
