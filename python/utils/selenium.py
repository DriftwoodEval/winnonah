import base64
import hashlib
import logging
import os
import re
from datetime import date, datetime
from email.message import EmailMessage
from time import sleep, strftime, strptime
from urllib.parse import urlparse

import asana
import mysql.connector
import requests
import yaml
from asana.rest import ApiException
from dateutil.relativedelta import relativedelta
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from loguru import logger
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import Select


### UTILS ###
def initialize_selenium() -> tuple[WebDriver, ActionChains]:
    logger.info("Initializing Selenium")
    chrome_options: Options = Options()
    chrome_options.add_argument("--no-sandbox")
    if os.getenv("HEADLESS") == "true":
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(options=chrome_options)
    actions = ActionChains(driver)
    driver.implicitly_wait(5)
    driver.set_window_size(1920, 1080)
    return driver, actions


def click_element(
    driver: WebDriver,
    by: str,
    locator: str,
    max_attempts: int = 3,
    delay: int = 1,
    refresh: bool = False,
) -> None:
    for attempt in range(max_attempts):
        try:
            element = driver.find_element(by, locator)
            element.click()
            return
        except (StaleElementReferenceException, NoSuchElementException) as e:
            logger.warning(f"Attempt {attempt + 1} failed: {type(e).__name__}.")
            sleep(delay)
            if refresh:
                logger.info("Refreshing page")
                driver.refresh()
            sleep(delay)
    raise NoSuchElementException(f"Element not found after {max_attempts} attempts")


def find_element(
    driver: WebDriver, by: str, locator: str, max_attempts: int = 3, delay: int = 1
) -> WebElement:
    for attempt in range(max_attempts):
        try:
            element = driver.find_element(by, locator)
            return element
        except (StaleElementReferenceException, NoSuchElementException) as e:
            logger.warning(
                f"Attempt {attempt + 1} failed: {type(e).__name__}. Retrying..."
            )
            sleep(delay)
    raise NoSuchElementException(f"Element not found after {max_attempts} attempts")


def check_if_element_exists(
    driver: WebDriver, by: str, locator: str, max_attempts: int = 3, delay: int = 1
) -> bool:
    for attempt in range(max_attempts):
        try:
            driver.find_element(by, locator)
            return True
        except (StaleElementReferenceException, NoSuchElementException) as e:
            logger.warning(
                f"Attempt {attempt + 1} failed: {type(e).__name__}. Retrying..."
            )
            sleep(delay)
    logger.error(f"Failed to find element after {max_attempts} attempts")
    return False


### THERAPYAPPOINTMENT ###
def login_ta(driver: WebDriver, actions: ActionChains) -> None:
    logger.info("Logging in to TherapyAppointment")

    logger.debug("Going to login page")
    driver.get("https://portal.therapyappointment.com")

    logger.debug("Entering username")
    username_field = find_element(driver, By.NAME, "user_username")
    ta_username = os.getenv("TA_USERNAME")
    if ta_username is None:
        raise ValueError("TA_USERNAME environment variable is not set")

    username_field.send_keys(ta_username)

    logger.debug("Entering password")
    password_field = find_element(driver, By.NAME, "user_password")
    ta_password = os.getenv("TA_PASSWORD")
    if ta_password is None:
        raise ValueError("TA_PASSWORD environment variable is not set")
    password_field.send_keys(ta_password)

    logger.debug("Submitting login form")
    actions.send_keys(Keys.ENTER)
    actions.perform()
