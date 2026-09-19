from unittest.mock import MagicMock, patch
from urllib.parse import quote

import pytest
from selenium.common.exceptions import TimeoutException

from utils import medicaid
from utils.webdriving import initialize_selenium

RESULTS_PAGE = (
    "<html><body><ul>"
    "<li><label>Qual. Category:</label><p>DISABLED</p></li>"
    "<li><label>Payment Category:</label><p>TEFRA</p></li>"
    "</ul><table>"
    "<tr><td class='td3b'>Organization:</td><td class='td4'>SELECT HEALTH OF SOUTH CAR</td></tr>"
    "{carriers}"
    "</table></body></html>"
)
CARRIER_ROWS = (
    "<tr><td class='td3b'>Carrier 1:</td><td class='td4'>CARRIER ONE</td></tr>"
    "<tr><td class='td3b'>Carrier 2:</td><td class='td4'>CARRIER TWO</td></tr>"
)


@pytest.fixture
def driver(monkeypatch):
    monkeypatch.setenv("HEADLESS", "true")
    driver, _ = initialize_selenium()
    yield driver
    driver.quit()


def _load(driver, carriers: str) -> None:
    html = RESULTS_PAGE.format(carriers=carriers)
    driver.get("data:text/html," + quote(html))


class TestReadEligibility:
    def test_reads_organization_and_both_carriers(self, driver):
        _load(driver, CARRIER_ROWS)

        assert medicaid.read_eligibility(driver) == {
            "qualCategory": "DISABLED",
            "paymentCategory": "TEFRA",
            "medicaidOrganization": "SELECT HEALTH OF SOUTH CAR",
            "medicaidCarrier1": "CARRIER ONE",
            "medicaidCarrier2": "CARRIER TWO",
        }

    def test_missing_carriers_are_none(self, driver):
        _load(driver, "")

        result = medicaid.read_eligibility(driver)

        assert result["medicaidOrganization"] == "SELECT HEALTH OF SOUTH CAR"
        assert result["medicaidCarrier1"] is None
        assert result["medicaidCarrier2"] is None


CLIENT = {
    "id": 7,
    "firstName": "A",
    "lastName": "B",
    "policyId": "policy-1",
    "insuranceNumber": "1234567890",
}


class TestRunLookup:
    def _run(self, search_side_effect):
        with (
            patch.object(
                medicaid.utils.database,
                "get_medicaid_clients_with_ids",
                return_value=[CLIENT],
            ),
            patch.object(medicaid, "check_and_login_medicaid"),
            patch.object(medicaid, "logout_medicaid"),
            patch.object(medicaid, "_ensure_logged_in"),
            patch.object(medicaid, "track_task") as track_task,
            patch.object(medicaid, "search_single_client") as search,
            patch.object(
                medicaid.utils.database, "update_client_medicaid_eligibility"
            ) as update,
        ):
            track_task.return_value.__enter__.return_value = MagicMock()
            search.side_effect = search_side_effect
            medicaid.lookup_due_medicaid_eligibility()
            return update

    def test_stores_scraped_fields(self):
        found = {"qualCategory": "X"}

        update = self._run([found])

        update.assert_called_once_with(7, found, "policy-1")

    def test_client_not_found_after_retry_is_stamped_without_fields(self):
        update = self._run([TimeoutException(), TimeoutException()])

        update.assert_called_once_with(7, None, "policy-1")

    def test_other_failure_after_retry_is_skipped_not_stamped(self):
        update = self._run([TimeoutException(), RuntimeError("driver died")])

        update.assert_not_called()
