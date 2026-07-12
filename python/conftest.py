import pytest


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
