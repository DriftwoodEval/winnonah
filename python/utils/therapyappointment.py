import glob
import os
import shutil
import time
from time import sleep
from typing import Callable

import pandas as pd
from loguru import logger
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from selenium.webdriver import ActionChains, Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver

import utils.database
import utils.webdriving as w
from utils.misc import get_column


def login_ta(driver: WebDriver, actions: ActionChains) -> None:
    """Log in to TherapyAppointment."""
    logger.info("Logging in to TherapyAppointment")

    logger.debug("Entering username")
    username_field = w.find_element(driver, By.NAME, "user_username")
    ta_username = os.getenv("TA_USERNAME")
    if ta_username is None:
        raise ValueError("TA_USERNAME environment variable is not set")

    username_field.send_keys(ta_username)

    logger.debug("Entering password")
    password_field = w.find_element(driver, By.NAME, "user_password")
    ta_password = os.getenv("TA_PASSWORD")
    if ta_password is None:
        raise ValueError("TA_PASSWORD environment variable is not set")
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
    except (NoSuchElementException, TimeoutException):
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


def _export_data(driver: WebDriver, npi: str):
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
        except (NoSuchElementException, TimeoutException):
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
            except (NoSuchElementException, TimeoutException):
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
        def get_newest_downloaded_file():
            files = glob.glob(f"{os.getcwd()}/temp/downloads/*.csv")
            return max(files, key=os.path.getctime)

        logger.debug(f"Downloading {data_title}")
        try:
            w.click_element(
                driver,
                By.XPATH,
                f"//h5[contains(normalize-space(text()), '{data_title}')]/following-sibling::p/a[contains(text(), 'Download')]",
                1,
            )
            time.sleep(2)
            if data_title == "Client Appointments":
                os.rename(
                    get_newest_downloaded_file(),
                    f"temp/downloads/clients-appointments_{npi}.csv",
                )
            return True
        except (NoSuchElementException, TimeoutException):
            logger.error(f"Could not find {data_title} Download button")
            return False

    driver.get(driver.current_url + "#therapist-data-export")

    started = _helper(driver, "Client Appointments")
    if not started:
        return
    time.sleep(2)
    _helper(driver, "Client Charts")
    time.sleep(2)
    _helper(driver, "Clients")
    time.sleep(2)
    _helper(driver, "Insurance Policies and Benefits")
    time.sleep(2)


def _loop_therapists(driver: WebDriver, func: Callable):
    """Loops through therapists and runs a function for each therapist."""

    def _helper(driver: WebDriver, count: int) -> int:
        therapist_element = w.find_element(
            driver, By.CSS_SELECTOR, f"#nav-staff-menu>ul>li:nth-child({count + 1})>a"
        )
        therapist_name = therapist_element.text
        if any(
            s in therapist_name for s in os.environ.get("EXCLUDED_TA", "").split(",")
        ):
            logger.debug(f"Skipping therapist: {therapist_name}")
            count += 1
            return count
        logger.debug(f"Looping for therapist: {therapist_name}")
        therapist_element.click()
        return count

    logger.debug("Looping therapists")

    driver.refresh()
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(2)
    w.click_element(driver, By.ID, "nav-staff-menu")
    time.sleep(2)
    ul_element = w.find_element(driver, By.CSS_SELECTOR, "#nav-staff-menu>ul")
    therapist_count = len(ul_element.find_elements(By.CSS_SELECTOR, "li"))
    therapist_iterator = 0
    while therapist_iterator < therapist_count:
        driver.refresh()
        driver.execute_script("window.scrollTo(0, 0);")
        w.click_element(driver, By.ID, "nav-staff-menu")
        time.sleep(3)
        ul_element = w.find_element(driver, By.CSS_SELECTOR, "#nav-staff-menu>ul")
        new_count = _helper(driver, therapist_iterator)
        if new_count == therapist_iterator + 1:
            therapist_iterator += 1
            continue
        try:
            therapist_npi = w.find_element(
                driver,
                By.XPATH,
                "//div[contains(text(), 'Individual (Type 1) NPI Number')]/following-sibling::div",
                1,
            ).text.split()[0]
        except (NoSuchElementException, TimeoutException):
            logger.error("Could not find therapist NPI, skipping!")
            therapist_iterator += 1
            continue
        func(driver, therapist_npi)
        therapist_iterator += 1


def _combine_files():
    """Combines multiple therapists' CSV files into a single CSV file."""
    logger.debug("Combining CSVs")

    def _read_and_concat_files(pattern, output_file: str):
        files = glob.glob(pattern)
        df_list = []
        for file in files:
            try:
                df = pd.read_csv(file, encoding="utf-8", dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(file, encoding="latin1", dtype=str)

            df.dropna(how="all", inplace=True)
            df_list.append(df)
        df = pd.concat(df_list)
        df.to_csv(output_file, index=False, encoding="utf-8")

    def _add_npi_and_merge(pattern: str, output_file: str):
        files = glob.glob(pattern)
        df_list = []
        for file in files:
            npi = os.path.basename(file).split("_")[-1].split(".")[0]
            try:
                df = pd.read_csv(file, encoding="utf-8", dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(file, encoding="latin1", dtype=str)
            df.dropna(how="all", inplace=True)

            df["NPI"] = npi
            df_list.append(df)
        df = pd.concat(df_list)
        df.to_csv(output_file, index=False, encoding="utf-8")

    output_directory = os.path.dirname("temp/input/")
    if not os.path.exists(output_directory):
        os.makedirs(output_directory)

    _add_npi_and_merge(
        "temp/downloads/clients-appointments_*.csv",
        os.path.join(output_directory, "clients-appointments.csv"),
    )
    _read_and_concat_files(
        "temp/downloads/dataExport-demographic*.csv",
        os.path.join(output_directory, "clients-demographic.csv"),
    )
    _read_and_concat_files(
        "temp/downloads/dataExport-insurance*.csv",
        os.path.join(output_directory, "clients-insurance.csv"),
    )
    _read_and_concat_files(
        "temp/downloads/dataExport-chart*.csv",
        os.path.join(output_directory, "clients-chart.csv"),
    )


def _download_referrals(driver: WebDriver):
    """Downloads referrals CSV from reports."""
    logger.debug("Opening reports page")
    driver.get(
        "https://api.portal.therapyappointment.com/n/reporting/businessintelligence/referralsource"
    )
    w.click_element(driver, By.XPATH, "//span[contains(text(), 'Export CSV')]")
    time.sleep(2)
    shutil.move(
        os.path.join("temp", "downloads", "client-referral-report.csv"),
        os.path.join("temp", "input", "client-referral-report.csv"),
    )


def download_csvs():
    """Downloads CSVs from TherapyAppointment."""
    logger.debug("Downloading CSVs from TherapyAppointment")
    driver, actions = w.initialize_selenium()
    check_and_login_ta(driver, actions, first_time=True)
    _open_profile(driver)
    _loop_therapists(driver, _export_data)
    _loop_therapists(driver, _download_data)
    _combine_files()
    _download_referrals(driver)


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
                else:
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
                return
            else:
                logger.error(f"Failed to go to client, trying again: {e}")
    return


def get_ta_hash(driver: WebDriver, actions: ActionChains, client_id: str) -> str | None:
    """Goes to the client's profile and returns their hash from their link."""
    client_url = go_to_client(driver, actions, client_id)
    if not client_url:
        return None
    return client_url.split("/")[-1]


def save_ta_hashes():
    """Goes to each client's profile and saves their hash from their link."""
    driver, actions = w.initialize_selenium()
    clients = utils.database.get_all_clients()

    clients = clients[(clients["TA_HASH"].isna()) | (clients["TA_HASH"] == "NONE")]

    for index, client in clients.iterrows():
        client_id = get_column(client, "CLIENT_ID")
        if not isinstance(client_id, (int, str)):
            continue
        client_id = str(client_id).strip()
        ta_hash = get_ta_hash(driver, actions, client_id)
        clients.loc[index, "TA_HASH"] = ta_hash

    utils.database.put_clients_in_db(clients)
