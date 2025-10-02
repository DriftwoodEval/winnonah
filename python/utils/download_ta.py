import glob
import os
import shutil
import time
from typing import Callable

import pandas as pd
from loguru import logger
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver

import utils.webdriving as w


def open_profile(driver: WebDriver):
    """Opens the therapist profile page."""
    logger.debug("Opening profile")
    w.click_element(driver, By.CLASS_NAME, "user-menu-button")
    w.click_element(
        driver,
        By.XPATH,
        "//span[contains(normalize-space(text()), 'Your Profile')]",
    )


def export_data(driver: WebDriver):
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
        except NoSuchElementException:
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
            except NoSuchElementException:
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


def download_data(driver: WebDriver):
    """Downloads therapist data to CSV files."""

    def _helper(driver: WebDriver, data_title: str):
        logger.debug(f"Downloading {data_title}")
        try:
            w.click_element(
                driver,
                By.XPATH,
                f"//h5[contains(normalize-space(text()), '{data_title}')]/following-sibling::p/a[contains(text(), 'Download')]",
                1,
            )
            return True
        except NoSuchElementException:
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


def loop_therapists(driver: WebDriver, func: Callable):
    """Loops through therapists and runs a function for each therapist."""

    def _helper(driver: WebDriver, count: int) -> int:
        therapist_element = w.find_element(
            driver, By.CSS_SELECTOR, f"#nav-staff-menu>ul>li:nth-child({count + 1})>a"
        )
        if any(
            s in therapist_element.text
            for s in os.environ.get("EXCLUDED_TA", "").split(",")
        ):
            logger.debug(f"Skipping therapist: {therapist_element.text}")
            count += 1
            return count
        logger.debug(f"Looping for therapist: {therapist_element.text}")
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
        func(driver)
        therapist_iterator += 1


def combine_files():
    """Combines multiple therapists' CSV files into a single CSV file."""
    logger.debug("Combining CSVs")

    def read_and_concat_files(pattern, output_file):
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

    output_directory = os.path.dirname("temp/input/")
    if not os.path.exists(output_directory):
        os.makedirs(output_directory)
    read_and_concat_files(
        "temp/downloads/dataExport-appointments*.csv",
        os.path.join(output_directory, "clients-appointments.csv"),
    )
    read_and_concat_files(
        "temp/downloads/dataExport-demographic*.csv",
        os.path.join(output_directory, "clients-demographic.csv"),
    )
    read_and_concat_files(
        "temp/downloads/dataExport-insurance*.csv",
        os.path.join(output_directory, "clients-insurance.csv"),
    )
    read_and_concat_files(
        "temp/downloads/dataExport-chart*.csv",
        os.path.join(output_directory, "clients-chart.csv"),
    )


def download_referrals(driver: WebDriver):
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
    w.login_ta(driver, actions)
    open_profile(driver)
    loop_therapists(driver, export_data)
    loop_therapists(driver, download_data)
    combine_files()
    download_referrals(driver)
