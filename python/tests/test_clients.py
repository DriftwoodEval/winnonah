import numpy as np
import pandas as pd

from utils.clients import (
    _combine_address_info,
    _consolidate_by_id,
    _merge_referral_data,
    _normalize_for_match,
    _normalize_names,
    _remove_invalid_clients,
    _remove_test_names,
)


class TestNormalizeForMatch:
    def test_lowercases_and_strips_punctuation(self):
        assert _normalize_for_match("O'Brien-Smith") == "obriensmith"

    def test_strips_digits(self):
        assert _normalize_for_match("Dr. Smith 3rd") == "dr smith rd"

    def test_collapses_whitespace(self):
        assert _normalize_for_match("John   Smith") == "john smith"

    def test_returns_empty_string_for_none(self):
        assert _normalize_for_match(None) == ""

    def test_returns_empty_string_for_nan(self):
        assert _normalize_for_match(float("nan")) == ""

    def test_returns_empty_string_for_empty_string(self):
        assert _normalize_for_match("") == ""


class TestNormalizeNames:
    def test_capitalizes_first_and_last_name(self):
        df = pd.DataFrame({"FIRSTNAME": ["john"], "LASTNAME": ["mcdonald"]})
        result = _normalize_names(df)
        assert result.iloc[0]["FIRSTNAME"] == "John"
        assert result.iloc[0]["LASTNAME"] == "McDonald"

    def test_nullifies_preferred_name_matching_first_name(self):
        df = pd.DataFrame(
            {
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["john"],
            }
        )
        result = _normalize_names(df)
        assert pd.isna(result.iloc[0]["PREFERRED_NAME"])

    def test_nullifies_preferred_name_matching_full_name(self):
        df = pd.DataFrame(
            {
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["John Smith"],
            }
        )
        result = _normalize_names(df)
        assert pd.isna(result.iloc[0]["PREFERRED_NAME"])

    def test_keeps_genuinely_different_preferred_name(self):
        df = pd.DataFrame(
            {
                "FIRSTNAME": ["Jonathan"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["johnny"],
            }
        )
        result = _normalize_names(df)
        assert result.iloc[0]["PREFERRED_NAME"] == "Johnny"

    def test_suffix_preferred_name_is_capitalized_like_any_other_name(self):
        df = pd.DataFrame(
            {
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["JR"],
            }
        )
        result = _normalize_names(df)
        assert result.iloc[0]["PREFERRED_NAME"] == "Jr"

    def test_nan_preferred_name_is_left_alone(self):
        df = pd.DataFrame(
            {
                "FIRSTNAME": ["John"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": [np.nan],
            }
        )
        result = _normalize_names(df)
        assert pd.isna(result.iloc[0]["PREFERRED_NAME"])

    def test_missing_optional_columns_do_not_raise(self):
        df = pd.DataFrame({"FIRSTNAME": ["john"]})
        result = _normalize_names(df)
        assert result.iloc[0]["FIRSTNAME"] == "John"


class TestRemoveTestNames:
    def test_removes_known_test_name(self):
        df = pd.DataFrame(
            {"FIRSTNAME": ["Testman", "John"], "LASTNAME": ["Testson", "Smith"]}
        )
        result = _remove_test_names(df)
        assert list(result["FIRSTNAME"]) == ["John"]

    def test_match_is_case_insensitive(self):
        df = pd.DataFrame({"FIRSTNAME": ["TESTMAN"], "LASTNAME": ["TESTSON"]})
        result = _remove_test_names(df)
        assert result.empty

    def test_keeps_non_matching_rows(self):
        df = pd.DataFrame({"FIRSTNAME": ["John"], "LASTNAME": ["Smith"]})
        result = _remove_test_names(df)
        assert len(result) == 1


class TestConsolidateById:
    def test_keeps_first_row_per_client_id(self):
        df = pd.DataFrame(
            {
                "CLIENT_ID": [1, 1, 2],
                "FIRSTNAME": ["John", "John", "Jane"],
                "POLICY_TYPE": ["Primary", "Secondary", "Primary"],
            }
        )
        result = _consolidate_by_id(df)
        assert list(result["CLIENT_ID"]) == [1, 2]

    def test_drops_insurance_policy_columns(self):
        df = pd.DataFrame(
            {
                "CLIENT_ID": [1],
                "FIRSTNAME": ["John"],
                "POLICY_TYPE": ["Primary"],
                "POLICY_INSURANCENUMBER": ["123"],
            }
        )
        result = _consolidate_by_id(df)
        assert "POLICY_TYPE" not in result.columns
        assert "POLICY_INSURANCENUMBER" not in result.columns
        assert "FIRSTNAME" in result.columns

    def test_missing_insurance_columns_do_not_raise(self):
        df = pd.DataFrame({"CLIENT_ID": [1], "FIRSTNAME": ["John"]})
        result = _consolidate_by_id(df)
        assert list(result["CLIENT_ID"]) == [1]


class TestRemoveInvalidClients:
    def test_removes_rows_with_nan_client_id(self):
        df = pd.DataFrame({"CLIENT_ID": [1, np.nan, 3]})
        result = _remove_invalid_clients(df)
        assert list(result["CLIENT_ID"]) == [1, 3]

    def test_keeps_empty_string_client_id(self):
        # Only actual NaN is treated as invalid, not an empty string.
        df = pd.DataFrame({"CLIENT_ID": [1, ""]})
        result = _remove_invalid_clients(df)
        assert len(result) == 2


def make_address_row(**overrides):
    base = {
        "USER_ADDRESS_ADDRESS1": np.nan,
        "USER_ADDRESS_ADDRESS2": np.nan,
        "USER_ADDRESS_ADDRESS3": np.nan,
        "USER_ADDRESS_CITY": np.nan,
        "USER_ADDRESS_STATE": np.nan,
        "USER_ADDRESS_ZIP": np.nan,
    }
    base.update(overrides)
    return base


class TestCombineAddressInfo:
    def test_combines_full_address(self):
        df = pd.DataFrame(
            [
                make_address_row(
                    USER_ADDRESS_ADDRESS1="123 main st",
                    USER_ADDRESS_CITY="columbia",
                    USER_ADDRESS_STATE="sc",
                    USER_ADDRESS_ZIP="29201",
                )
            ]
        )
        result = _combine_address_info(df)
        assert result.iloc[0]["ADDRESS"] == "123 Main St, Columbia, SC 29201"

    def test_dedupes_identical_address_lines(self):
        df = pd.DataFrame(
            [
                make_address_row(
                    USER_ADDRESS_ADDRESS1="123 Main St",
                    USER_ADDRESS_ADDRESS2="123 Main St",
                )
            ]
        )
        result = _combine_address_info(df)
        assert result.iloc[0]["ADDRESS"].count("Main St") == 1

    def test_strips_commas_and_quotes_from_address_lines(self):
        df = pd.DataFrame(
            [make_address_row(USER_ADDRESS_ADDRESS1='123 "Main" St, Apt 2')]
        )
        result = _combine_address_info(df)
        assert '"' not in result.iloc[0]["ADDRESS"]

    def test_strips_trailing_dash_from_zip(self):
        df = pd.DataFrame([make_address_row(USER_ADDRESS_ZIP="29201-")])
        result = _combine_address_info(df)
        assert "29201" in result.iloc[0]["ADDRESS"]
        assert "29201-" not in result.iloc[0]["ADDRESS"]

    def test_all_blank_fields_produce_na(self):
        df = pd.DataFrame([make_address_row()])
        result = _combine_address_info(df)
        assert pd.isna(result.iloc[0]["ADDRESS"])


class TestMergeReferralData:
    def test_no_referral_file_sets_none(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        clients_df = pd.DataFrame({"FIRSTNAME": ["John"], "LASTNAME": ["Smith"]})

        result = _merge_referral_data(clients_df)

        assert result.iloc[0]["REFERRAL_SOURCE"] is None

    def test_matches_by_legal_name(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        input_dir = tmp_path / "temp" / "input"
        input_dir.mkdir(parents=True)
        (input_dir / "client-referral-report.csv").write_text(
            "Client Name,Referral Name\nJohn Smith,Dr. Jones\n"
        )
        clients_df = pd.DataFrame({"FIRSTNAME": ["John"], "LASTNAME": ["Smith"]})

        result = _merge_referral_data(clients_df)

        assert result.iloc[0]["REFERRAL_SOURCE"] == "DR. JONES"

    def test_falls_back_to_preferred_name_when_legal_name_unmatched(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.chdir(tmp_path)
        input_dir = tmp_path / "temp" / "input"
        input_dir.mkdir(parents=True)
        (input_dir / "client-referral-report.csv").write_text(
            "Client Name,Referral Name\nJohnny Smith,Dr. Jones\n"
        )
        clients_df = pd.DataFrame(
            {
                "FIRSTNAME": ["Jonathan"],
                "LASTNAME": ["Smith"],
                "PREFERRED_NAME": ["Johnny"],
            }
        )

        result = _merge_referral_data(clients_df)

        assert result.iloc[0]["REFERRAL_SOURCE"] == "DR. JONES"

    def test_extracts_phone_number_from_referral_name(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        input_dir = tmp_path / "temp" / "input"
        input_dir.mkdir(parents=True)
        (input_dir / "client-referral-report.csv").write_text(
            "Client Name,Referral Name\nJohn Smith,Dr. Jones (803) 555-1234\n"
        )
        clients_df = pd.DataFrame({"FIRSTNAME": ["John"], "LASTNAME": ["Smith"]})

        result = _merge_referral_data(clients_df)

        assert result.iloc[0]["REFERRAL_SOURCE"] == "DR. JONES (8035551234)"

    def test_no_match_returns_none(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        input_dir = tmp_path / "temp" / "input"
        input_dir.mkdir(parents=True)
        (input_dir / "client-referral-report.csv").write_text(
            "Client Name,Referral Name\nSomeone Else,Dr. Jones\n"
        )
        clients_df = pd.DataFrame({"FIRSTNAME": ["John"], "LASTNAME": ["Smith"]})

        result = _merge_referral_data(clients_df)

        assert result.iloc[0]["REFERRAL_SOURCE"] is None
