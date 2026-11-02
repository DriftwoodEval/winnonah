import pytest
from selenium.common.exceptions import WebDriverException

from utils.webdriving import initialize_selenium


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run tests marked 'integration' (hit real external services with test-only data)",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: hits a real external service with test-only data (e.g. "
        "Testman Testson); skipped by default, run with --run-integration",
    )


def pytest_collection_modifyitems(config, items):
    if config.getoption("--run-integration"):
        return
    skip_integration = pytest.mark.skip(reason="use --run-integration to run")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


@pytest.fixture
def driver(monkeypatch):
    """A headless Chrome driver, or a skip when no usable browser is installed.

    Browser startup fails when Chrome and chromedriver are missing or have
    mismatched versions. The Docker test image ships a matching pair.
    """
    monkeypatch.setenv("HEADLESS", "true")
    try:
        driver, _ = initialize_selenium()
    except WebDriverException as e:
        pytest.skip(f"Chrome and chromedriver unavailable: {e.msg}")
    yield driver
    driver.quit()
