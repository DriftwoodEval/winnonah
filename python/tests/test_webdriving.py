from unittest.mock import MagicMock, call

import pytest

from utils.webdriving import (
    IMPLICIT_WAIT_SECONDS,
    click_element,
    find_element,
    no_implicit_wait,
)

SMOKE_PAGE = (
    "data:text/html,"
    "<html><head><title>Smoke Test</title></head>"
    "<body><button id='go' onclick=\"document.getElementById('result').innerText='clicked'\">"
    "Click me</button><p id='result'>waiting</p></body></html>"
)


class TestSeleniumSmoke:
    def test_opens_a_page_and_reads_its_title(self, driver):
        driver.get(SMOKE_PAGE)
        assert driver.title == "Smoke Test"

    def test_finds_and_clicks_an_element(self, driver):
        driver.get(SMOKE_PAGE)
        click_element(driver, "id", "go")
        result = find_element(driver, "id", "result")
        assert result.text == "clicked"


class TestNoImplicitWait:
    def test_disables_the_wait_then_restores_it(self):
        driver = MagicMock()

        with no_implicit_wait(driver):
            pass

        assert driver.implicitly_wait.call_args_list == [
            call(0),
            call(IMPLICIT_WAIT_SECONDS),
        ]

    def test_restores_the_wait_when_the_block_raises(self):
        driver = MagicMock()

        with pytest.raises(RuntimeError), no_implicit_wait(driver):
            raise RuntimeError

        assert driver.implicitly_wait.call_args_list[-1] == call(IMPLICIT_WAIT_SECONDS)
