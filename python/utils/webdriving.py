import os
from time import sleep

from loguru import logger
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


### UTILS ###
def initialize_selenium() -> tuple[WebDriver, ActionChains]:
    """Initialize a Selenium WebDriver with the given options."""
    logger.info("Initializing Selenium")
    chrome_options: Options = Options()
    chrome_options.add_argument("--no-sandbox")
    if os.getenv("HEADLESS") == "true":
        chrome_options.add_argument("--headless")
    # /dev/shm partition can be too small in VMs, causing Chrome to crash, make a temp dir instead
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_experimental_option(
        "prefs",
        {
            "download.default_directory": f"{os.getcwd()}/temp/downloads",
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        },
    )
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
    timeout: int = 5,
    refresh: bool = False,
) -> None:
    """Click on a web element located by the specified method within the given attempts."""
    for attempt in range(max_attempts):
        try:
            element = find_element(
                driver, by, locator, timeout, condition=EC.element_to_be_clickable
            )
            element.click()
            return
        except StaleElementReferenceException:
            f"Attempt {attempt + 1}/{max_attempts} failed: Stale element. Retrying..."
            if refresh:
                logger.info("Refreshing page")
                driver.refresh()
                sleep(1)
        except (NoSuchElementException, TimeoutException) as e:
            if attempt == max_attempts - 1:
                raise e
            else:
                logger.warning("Click element failed: trying again after 1s.")
                sleep(1)


def find_element(
    driver: WebDriver,
    by: str,
    locator: str,
    timeout: int = 5,
    condition=EC.presence_of_element_located,
) -> WebElement:
    """Find a web element using an explicit wait."""
    try:
        element = WebDriverWait(driver, timeout).until(condition((by, locator)))
        return element
    except TimeoutException as e:
        logger.warning(
            f"Timeout ({timeout}s) waiting for element with {by}='{locator}'."
        )
        raise e


def check_if_element_exists(
    driver: WebDriver,
    by: str,
    locator: str,
    timeout: int = 5,
) -> bool:
    """Check if a web element exists using an explicit wait."""
    try:
        find_element(driver, by, locator, timeout)
        return True
    except (NoSuchElementException, TimeoutException):
        return False
