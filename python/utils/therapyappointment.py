import shutil
import time
from collections.abc import Callable
from pathlib import Path
from time import sleep

import pandas as pd
from loguru import logger
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver import ActionChains, Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver

import utils.database
import utils.webdriving as w
from utils.misc import get_column

DOWNLOAD_DIR = Path("temp/downloads")
INPUT_DIR = Path("temp/input")


def _wait_for_download(before: set[Path], timeout: int = 30) -> Path:
    """Waits for a new CSV to appear and finish downloading, returns its path."""
    logger.debug("Waiting for download to start...")
    deadline = time.monotonic() + timeout
    in_progress_logged = False
    while time.monotonic() < deadline:
        crdownloads = list(DOWNLOAD_DIR.glob("*.crdownload"))
        if crdownloads:
            if not in_progress_logged:
                logger.debug(f"Download in progress: {crdownloads[0].name}")
                in_progress_logged = True
            sleep(0.5)
            continue
        new_files = set(DOWNLOAD_DIR.glob("*.csv")) - before
        if new_files:
            result = max(new_files, key=lambda f: f.stat().st_ctime)
            logger.debug(f"Download complete: {result.name}")
            return result
        sleep(0.5)
    raise TimeoutError(f"Download did not complete within {timeout}s")


def login_ta(driver: WebDriver, actions: ActionChains) -> None:
    """Log in to TherapyAppointment."""
    logger.info("Logging in to TherapyAppointment")

    services = utils.database.get_services_config()
    ta = services.get("therapyappointment", {})
    ta_username = ta.get("admin_username")
    ta_password = ta.get("admin_password")
    if not ta_username or not ta_password:
        raise ValueError(
            "TherapyAppointment admin credentials not found in database config"
        )

    logger.debug("Entering username")
    username_field = w.find_element(driver, By.NAME, "user_username")
    username_field.send_keys(ta_username)

    logger.debug("Entering password")
    password_field = w.find_element(driver, By.NAME, "user_password")
    password_field.send_keys(ta_password)

    logger.debug("Submitting login form")
    actions.send_keys(Keys.ENTER)
    actions.perform()


def check_and_login_ta(
    driver: WebDriver,
    actions: ActionChains,
    first_time: bool = False,
) -> None:
    """Check if logged in to TherapyAppointment and log in if not."""
    ta_url = "https://api.portal.therapyappointment.com/n/client/allClients"
    if first_time:
        logger.debug("First time login to TherapyAppointment, logging in now.")
        driver.get(ta_url)
        login_ta(driver, actions)
        return
    try:
        logger.debug("Checking if logged in to TherapyAppointment")
        driver.get(ta_url)
        w.find_element(driver, By.XPATH, "//*[contains(text(), 'Clients')]", timeout=2)
        logger.debug("Already logged in to TherapyAppointment")
    except NoSuchElementException, TimeoutException:
        logger.debug("Not logged in to TherapyAppointment, logging in now.")
        login_ta(driver, actions)


def _open_profile(driver: WebDriver):
    """Opens the therapist profile page."""
    logger.debug("Opening profile")
    w.click_element(driver, By.CLASS_NAME, "user-menu-button")
    w.click_element(
        driver,
        By.XPATH,
        "//span[contains(normalize-space(text()), 'Your Profile')]",
    )


def _export_data(driver: WebDriver, npi: str | None = None):  # noqa: ARG001 Needs to match function signature of _download_data
    """Exports therapist data to CSV files."""

    def _helper(driver: WebDriver, data_title: str) -> bool:
        logger.debug(f"Exporting {data_title}")
        try:
            w.click_element(
                driver,
                By.XPATH,
                f"//h5[contains(normalize-space(text()), '{data_title}')]/following-sibling::p/a[contains(text(), 'Re-Export')]",
                1,
            )
            return True
        except NoSuchElementException, TimeoutException:
            try:
                logger.error(
                    f"Could not find {data_title} Re-Export button, has it never been started before?"
                )
                w.click_element(
                    driver,
                    By.XPATH,
                    f"//h5[contains(normalize-space(text()), '{data_title}')]/following-sibling::p/a[contains(text(), 'Start')]",
                    1,
                )
                return True
            except NoSuchElementException, TimeoutException:
                logger.error(f"Could not find {data_title} Start button")
                return False

    driver.get(driver.current_url + "#therapist-data-export")

    started = _helper(driver, "Client Appointments")
    if not started:
        return
    w.click_element(driver, By.CSS_SELECTOR, "[data-dismiss='modal']")
    _helper(driver, "Client Charts")
    w.click_element(driver, By.CSS_SELECTOR, "[data-dismiss='modal']")
    _helper(driver, "Clients")
    w.click_element(driver, By.CSS_SELECTOR, "[data-dismiss='modal']")
    _helper(driver, "Insurance Policies and Benefits")
    w.click_element(driver, By.CSS_SELECTOR, "[data-dismiss='modal']")


def _download_data(driver: WebDriver, npi: str):
    """Downloads therapist data to CSV files."""

    def _helper(
        driver: WebDriver,
        data_title: str,
    ):

        logger.debug(f"Downloading {data_title}")
        try:
            before = set(DOWNLOAD_DIR.glob("*.csv"))
            w.click_element(
                driver,
                By.XPATH,
                f"//h5[contains(normalize-space(text()), '{data_title}')]/following-sibling::p/a[contains(text(), 'Download')]",
                1,
            )
            downloaded = _wait_for_download(before)
            if data_title == "Client Appointments":
                Path.rename(
                    downloaded,
                    f"temp/downloads/clients-appointments_{npi}.csv",
                )
            return True
        except NoSuchElementException, TimeoutException:
            logger.error(f"Could not find {data_title} Download button")
            return False

    driver.get(driver.current_url + "#therapist-data-export")

    started = _helper(driver, "Client Appointments")
    if not started:
        return
    _helper(driver, "Client Charts")
    _helper(driver, "Clients")
    _helper(driver, "Insurance Policies and Benefits")


def _loop_therapists(driver: WebDriver, func: Callable):
    """Loops through therapists and runs a function for each therapist."""
    logger.debug("Looping therapists")

    driver.refresh()
    driver.execute_script("window.scrollTo(0, 0);")
    sleep(2)
    w.click_element(driver, By.ID, "nav-staff-menu")
    sleep(2)

    full_config = utils.database.get_python_config(config_id=1)
    excluded_list = full_config.get("config", {}).get("excluded_ta", [])
    ul_element = w.find_element(driver, By.CSS_SELECTOR, "#nav-staff-menu>ul")
    all_links = ul_element.find_elements(By.CSS_SELECTOR, "li > a")

    targets = []
    for link in all_links:
        name = link.text
        if any(excl in name for excl in excluded_list if excl.strip()):
            logger.debug(f"Skipping excluded therapist: {name}")
            continue
        targets.append({"name": name, "url": link.get_attribute("href")})

    for target in targets:
        logger.debug(f"Processing: {target['name']}")

        driver.get(target["url"])

        try:
            npi_element = w.find_element(
                driver,
                By.XPATH,
                "//div[contains(text(), 'Individual (Type 1) NPI Number')]/following-sibling::div",
                timeout=5,
            )
            therapist_npi = npi_element.text.split()[0]
            func(driver, therapist_npi)

        except NoSuchElementException, TimeoutException:
            logger.error(f"Could not find NPI for {target['name']}, skipping!")
            continue

    logger.debug("Completed therapist loop")


def _combine_files():
    """Combines multiple therapists' CSV files into a single CSV file."""
    logger.debug("Combining CSVs")
    INPUT_DIR.mkdir(parents=True, exist_ok=True)

    def _read_and_concat_files(pattern: str, output_file: Path):
        files = list(DOWNLOAD_DIR.glob(pattern))
        if not files:
            return

        df_list = []
        for file in files:
            try:
                df = pd.read_csv(file, encoding="utf-8", dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(file, encoding="latin1", dtype=str)

            df = df.dropna(how="all")
            df_list.append(df)

        if df_list:
            df = pd.concat(df_list)
            df.to_csv(output_file, index=False, encoding="utf-8")

    def _add_npi_and_merge(pattern: str, output_file: Path):
        files = list(DOWNLOAD_DIR.glob(pattern))
        if not files:
            return

        df_list = []
        for file in files:
            npi = file.stem.split("_")[-1]

            try:
                df = pd.read_csv(file, encoding="utf-8", dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(file, encoding="latin1", dtype=str)

            df = df.dropna(how="all")
            df["NPI"] = npi
            df_list.append(df)

        if df_list:
            df = pd.concat(df_list)
            df.to_csv(output_file, index=False, encoding="utf-8")

    Path.mkdir(INPUT_DIR, exist_ok=True)

    _add_npi_and_merge(
        "clients-appointments_*.csv",
        INPUT_DIR / "clients-appointments.csv",
    )
    _read_and_concat_files(
        "dataExport-demographic*.csv",
        INPUT_DIR / "clients-demographic.csv",
    )

    _read_and_concat_files(
        "dataExport-insurance*.csv",
        INPUT_DIR / "clients-insurance.csv",
    )

    _read_and_concat_files(
        "dataExport-chart*.csv",
        INPUT_DIR / "clients-chart.csv",
    )


def _download_referrals(driver: WebDriver):
    """Downloads referrals CSV from reports."""
    logger.debug("Opening reports page")
    sleep(2)
    driver.get(
        "https://api.portal.therapyappointment.com/n/reporting/businessintelligence/referralsource"
    )
    w.click_element(
        driver,
        By.XPATH,
        "//button[.//i[contains(@class, 'mdi-filter-outline')]]",
    )
    w.click_element(
        driver,
        By.XPATH,
        "//label[text()='Client Added']/following-sibling::input",
    )
    input_field = driver.find_element(
        By.XPATH, "//label[text()='From']/following-sibling::input"
    )

    input_field.send_keys(Keys.COMMAND + "a")
    input_field.send_keys(Keys.BACKSPACE)

    input_field.send_keys("01/01/2020")

    w.click_element(driver, By.XPATH, "//button[normalize-space()='OK']")
    w.click_element(driver, By.XPATH, "//button[@aria-label='Close dialog']")

    before = set(DOWNLOAD_DIR.glob("*.csv"))
    w.click_element(
        driver, By.XPATH, "//span[contains(text(), 'Export CSV')]", timeout=10
    )
    _wait_for_download(before)
    shutil.move(
        DOWNLOAD_DIR / "client-referral-report.csv",
        INPUT_DIR / "client-referral-report.csv",
    )


def _download_billing(driver: WebDriver):
    """Downloads open billing balances and submitted claims."""
    logger.debug("Opening open balances page")
    sleep(2)
    driver.get(
        "https://api.portal.therapyappointment.com/n/billing/balance/openBalances"
    )
    before = set(DOWNLOAD_DIR.glob("*.csv"))
    w.click_element(driver, By.XPATH, "//button[@title='More Options']", refresh=True)
    w.click_element(driver, By.XPATH, "//div[contains(text(), 'Download as CSV')]")
    _wait_for_download(before)

    logger.debug("Opening submitted claims page")
    driver.get("https://api.portal.therapyappointment.com/n/billing/claim/submitted")
    before = set(DOWNLOAD_DIR.glob("*.csv"))
    w.click_element(driver, By.XPATH, "//button[@title='More Options']")
    w.click_element(driver, By.XPATH, "//div[contains(text(), 'Download as CSV')]")
    _wait_for_download(before)

    open_bal_report = next(DOWNLOAD_DIR.glob("clients-with-open-balances-report-*.csv"))
    claims_report = next(DOWNLOAD_DIR.glob("submitted-claims-*.csv"))

    df_open = pd.read_csv(open_bal_report)
    df_claims = pd.read_csv(claims_report)

    cols_to_use = ["Client", "Date of Service", "Submitted", "Insurance"]
    merged_df = df_open.merge(df_claims[cols_to_use], on="Client", how="left")
    merged_df.to_csv(INPUT_DIR / "clients-billing.csv", index=False)


def download_csvs():
    """Downloads CSVs from TherapyAppointment."""
    logger.debug("Downloading CSVs from TherapyAppointment")
    driver, actions = w.initialize_selenium()
    check_and_login_ta(driver, actions, first_time=True)
    _open_profile(driver)
    _loop_therapists(driver, _export_data)
    _loop_therapists(driver, _download_data)
    _combine_files()
    for attempt in range(3):
        try:
            _download_referrals(driver)
            break
        except Exception as e:
            if attempt == 2:
                logger.error(
                    f"Failed to download referrals after 3 attempts, moving on: {e}"
                )
            else:
                logger.warning(
                    f"Failed to download referrals (attempt {attempt + 1}), retrying: {e}"
                )

    for attempt in range(3):
        try:
            _download_billing(driver)
            break
        except Exception as e:
            if attempt == 2:
                logger.error(
                    f"Failed to download billing after 3 attempts, moving on: {e}"
                )
            else:
                logger.warning(
                    f"Failed to download billing (attempt {attempt + 1}), retrying: {e}"
                )


def go_to_client(
    driver: WebDriver, actions: ActionChains, client_id: str
) -> str | None:
    """Navigates to the given client in TA and returns the client's URL."""

    def _search_clients(
        driver: WebDriver, actions: ActionChains, client_id: str
    ) -> None:
        logger.info(f"Searching for {client_id} on TA")
        sleep(2)

        logger.debug("Trying to escape random popups")
        actions.send_keys(Keys.ESCAPE)
        actions.perform()

        logger.debug("Checking if all statuses are selected")
        all_statuses_selected = w.check_if_element_exists(
            driver,
            By.XPATH,
            "//span[contains(@class, 'v-chip__content') and contains(text(), 'New')]",
        )

        if not all_statuses_selected:
            logger.debug("Filtering to all statuses")
            client_status_label = w.find_element(
                driver, By.XPATH, "//label[text()='Client Status']"
            )
            client_status_field = client_status_label.find_element(
                By.XPATH, "./following-sibling::div"
            )
            client_status_field.click()

            w.click_element(
                driver,
                By.XPATH,
                "//div[contains(text(), 'Select All')]",
            )

        logger.debug("Entering client ID")
        client_id_label = w.find_element(
            driver, By.XPATH, "//label[text()='Account Number']"
        )
        client_id_field = client_id_label.find_element(
            By.XPATH, "./following-sibling::input"
        )
        client_id_field.send_keys(client_id)

        logger.debug("Clicking search")
        w.click_element(driver, By.CSS_SELECTOR, "button[aria-label='Search'")

    def _go_to_client_loop(
        driver: WebDriver, actions: ActionChains, client_id: str
    ) -> str:
        check_and_login_ta(driver, actions)
        sleep(1)
        driver.get("https://api.portal.therapyappointment.com/n/client/allClients")

        for attempt in range(3):
            try:
                _search_clients(driver, actions, client_id)
                break
            except Exception as e:
                if attempt == 2:
                    logger.error(f"Failed to search after 3 attempts: {e}")
                    raise e
                logger.warning(f"Failed to search: {e}, trying again")
                driver.refresh()

        sleep(1)

        logger.debug("Selecting client profile")

        w.click_element(
            driver,
            By.CSS_SELECTOR,
            "a[aria-description*='Press Enter to view the profile of",
            max_attempts=1,
        )

        current_url = driver.current_url
        logger.success(f"Navigated to client profile: {current_url}")
        return current_url

    for attempt in range(3):
        try:
            return _go_to_client_loop(driver, actions, client_id)
        except Exception as e:
            if attempt == 2:
                logger.error(f"Failed to go to client after 3 attempts: {e}")
                return None
            logger.error(f"Failed to go to client, trying again: {e}")
    return None


def get_ta_hash(driver: WebDriver, actions: ActionChains, client_id: str) -> str | None:
    """Goes to the client's profile and returns their hash from their link."""
    client_url = go_to_client(driver, actions, client_id)
    if not client_url:
        return None
    return client_url.split("/")[-1]


def save_ta_hashes():
    """Goes to each client's profile and saves their hash from their link."""
    driver, actions = w.initialize_selenium()

    with utils.database.db_session() as conn:
        clients = utils.database.get_all_clients(connection=conn)

        clients_to_update = clients[
            (clients["TA_HASH"].isna()) | (clients["TA_HASH"] == "NONE")
        ]

        logger.info(f"{len(clients_to_update)} clients to search for TA hashes")

        hashes_to_update: dict[str, str] = {}

        for i, (_, client) in enumerate(clients_to_update.iterrows()):
            client_id = get_column(client, "CLIENT_ID")
            if not isinstance(client_id, (int, str)):
                continue
            client_id = str(client_id).strip()
            ta_hash = get_ta_hash(driver, actions, client_id)
            if ta_hash:
                hashes_to_update[client_id] = ta_hash
                utils.database.resolve_failure_in_db(
                    client_id, "unable to find client", connection=conn
                )

            if (i + 1) % 10 == 0 and hashes_to_update:
                logger.info(f"Saving a batch of {len(hashes_to_update)} TA hashes...")
                utils.database.update_client_ta_hashes(
                    hashes_to_update, connection=conn
                )
                hashes_to_update = {}

        if hashes_to_update:
            logger.info(
                f"Saving the final batch of {len(hashes_to_update)} TA hashes..."
            )
            utils.database.update_client_ta_hashes(hashes_to_update, connection=conn)
