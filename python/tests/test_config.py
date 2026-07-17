import pytest

from utils.config import REQUIRED_VARS, validate_config

VALID_VALUES = {
    "DATABASE_URL": "mysql://user:pass@localhost/db",
    "PUNCHLIST_ID": "some-id",
    "PUNCHLIST_RANGE": "Sheet1!A1:B2",
    "CENSUS_API_KEY": "key",
    "OPENPHONE_API_TOKEN": "token",
    "FAX_FOLDER_ID": "folder-id",
    "BASE_FOLDER_ID": "folder-id",
    "REFERRAL_FAX_INTAKE_FOLDER_ID": "folder-id",
    "ERROR_EMAILS": "a@example.com",
}


def _set_all(monkeypatch, overrides=None):
    values = {**VALID_VALUES, **(overrides or {})}
    for var in REQUIRED_VARS:
        monkeypatch.setenv(var, values[var])


class TestValidateConfig:
    def test_passes_with_all_valid_values(self, monkeypatch):
        _set_all(monkeypatch)
        validate_config()

    def test_raises_when_var_missing(self, monkeypatch):
        _set_all(monkeypatch)
        monkeypatch.delenv("CENSUS_API_KEY")
        with pytest.raises(ValueError, match="CENSUS_API_KEY is not set"):
            validate_config()

    def test_raises_for_invalid_database_url(self, monkeypatch):
        _set_all(monkeypatch, {"DATABASE_URL": "not-a-url"})
        with pytest.raises(ValueError, match="Invalid DATABASE_URL format"):
            validate_config()

    def test_raises_for_invalid_punchlist_range(self, monkeypatch):
        _set_all(monkeypatch, {"PUNCHLIST_RANGE": "not-a-range"})
        with pytest.raises(ValueError, match="Invalid Google Sheets range format"):
            validate_config()

    def test_accepts_multiword_sheet_name_in_range(self, monkeypatch):
        _set_all(monkeypatch, {"PUNCHLIST_RANGE": "My Sheet!A1:B12"})
        validate_config()
