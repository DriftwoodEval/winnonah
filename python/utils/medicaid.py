from time import sleep

from loguru import logger
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver import ActionChains, Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support.ui import Select

import utils.database
import utils.webdriving as w

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


def lookup_new_scm_eligibility() -> None:
    """Look up eligibility for SCM clients that have never been checked (no qual_category)."""
    _run_scm_eligibility_lookup(only_new=True)


def lookup_scm_eligibility(
    only_new: bool = False,
    names: list[str] | None = None,
    client_ids: list[str] | None = None,
) -> None:
    """Force eligibility lookup for all SCM clients, or filter by name/ID strings."""
    _run_scm_eligibility_lookup(only_new=only_new, names=names, client_ids=client_ids)


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


def _run_scm_eligibility_lookup(
    only_new: bool,
    names: list[str] | None = None,
    client_ids: list[str] | None = None,
) -> None:
    clients = utils.database.get_scm_clients_with_medicaid_ids(only_new=only_new)

    if client_ids:
        str_ids = {str(cid) for cid in client_ids}
        clients = [c for c in clients if str(c["id"]) in str_ids]

    if names:

        def _matches_name(client: dict) -> bool:
            full = f"{client['firstName']} {client['lastName']}".lower()
            return any(n.lower() in full for n in names)

        clients = [c for c in clients if _matches_name(c)]

    if not clients:
        logger.info("No SCM clients to check eligibility for")
        return

    logger.info(f"Looking up eligibility for {len(clients)} SCM client(s)")
    try:
        driver = check_and_login_medicaid(first_time=True)
    except Exception:
        logger.warning("Initial SC Medicaid login failed, retrying in 60s")
        sleep(60)
        driver = check_and_login_medicaid(first_time=True)

    try:
        for client in clients:
            medicaid_id = client["insuranceNumber"]
            try:
                qual_category, payment_category = search_single_client(
                    driver, medicaid_id
                )
            except (NoSuchElementException, TimeoutException):
                logger.warning(
                    f"Error searching client {medicaid_id}, verifying login and retrying"
                )
                _ensure_logged_in(driver)
                try:
                    qual_category, payment_category = search_single_client(
                        driver, medicaid_id
                    )
                except Exception:
                    logger.error(
                        f"Failed to look up eligibility for client {medicaid_id} after re-login, skipping"
                    )
                    continue
            utils.database.update_client_medicaid_eligibility(
                client["id"], qual_category, payment_category
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


def search_single_client(driver: WebDriver, client_id: str) -> tuple[str, str]:
    """Search for a single client in SC Medicaid Portal and return (qual_category, payment_category)."""
    logger.info(f"Searching for client {client_id}")
    driver.get(f"{BASE_PORTAL_URL}/eligibility/entersinglequery")
    w.find_element(driver, By.NAME, "MedicaidID").send_keys(client_id)
    w.click_element(driver, By.NAME, "checkEligibilityButton")
    w.click_element(driver, By.NAME, "displayButton1")
    qual_category = w.find_element(
        driver, By.XPATH, "//li[label[text()='Qual. Category:']]/p"
    )
    payment_category = w.find_element(
        driver, By.XPATH, "//li[label[text()='Payment Category:']]/p"
    )
    return qual_category.text, payment_category.text
