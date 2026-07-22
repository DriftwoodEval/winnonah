import pandas as pd

from main import filter_clients_by_criteria


def make_clients_df():
    return pd.DataFrame(
        {
            "CLIENT_ID": [1, 2, 3],
            "FIRSTNAME": ["John", "Jane", "Robert"],
            "LASTNAME": ["Smith", "Doe", "Johnson"],
            "PREFERRED_NAME": ["Johnny", None, "Bob"],
        }
    )


class TestFilterClientsByCriteria:
    def test_no_criteria_returns_all_clients_unchanged(self):
        clients = make_clients_df()
        result = filter_clients_by_criteria(clients)
        assert result is not None
        assert list(result["CLIENT_ID"]) == [1, 2, 3]

    def test_filters_by_first_name_substring_case_insensitive(self):
        result = filter_clients_by_criteria(make_clients_df(), names=["john"])
        assert result is not None
        # Matches both "John" (first name) and "Johnson" (last name).
        assert set(result["CLIENT_ID"]) == {1, 3}

    def test_filters_by_full_name_spanning_first_and_last(self):
        result = filter_clients_by_criteria(make_clients_df(), names=["ane Do"])
        assert result is not None
        assert list(result["CLIENT_ID"]) == [2]

    def test_filters_by_preferred_name(self):
        result = filter_clients_by_criteria(make_clients_df(), names=["bob"])
        assert result is not None
        assert list(result["CLIENT_ID"]) == [3]

    def test_filters_by_client_id(self):
        result = filter_clients_by_criteria(make_clients_df(), client_ids=[2])
        assert result is not None
        assert list(result["CLIENT_ID"]) == [2]

    def test_client_id_match_and_name_match_are_unioned(self):
        result = filter_clients_by_criteria(
            make_clients_df(), names=["jane"], client_ids=[3]
        )
        assert result is not None
        assert set(result["CLIENT_ID"]) == {2, 3}

    def test_criteria_func_further_narrows_result(self):
        result = filter_clients_by_criteria(
            make_clients_df(),
            criteria_func=lambda row: row["CLIENT_ID"] > 1,
        )
        assert result is not None
        assert set(result["CLIENT_ID"]) == {2, 3}

    def test_all_falsy_names_and_ids_still_trigger_filtering_to_none(self):
        # A non-empty `names`/`client_ids` list makes `if names or client_ids`
        # true even when every entry is falsy, so filtering still runs, every
        # entry is skipped internally, and nothing matches: this returns None
        # rather than the unfiltered DataFrame.
        result = filter_clients_by_criteria(
            make_clients_df(), names=["", None], client_ids=[0, None, ""]
        )
        assert result is None

    def test_no_matches_returns_none(self):
        result = filter_clients_by_criteria(make_clients_df(), names=["nonexistent"])
        assert result is None
