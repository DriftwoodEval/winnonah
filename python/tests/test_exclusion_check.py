import datetime as dt
from unittest.mock import Mock, patch

import pytest
import requests as requests_module

from exclusion_check import (
    dedupe_matches,
    fetch_sam_exclusions,
    match_workers,
    normalize_name,
    normalize_npi,
    parse_sc_rows,
)


def test_normalize_name_strips_credentials_titles_and_punctuation():
    assert normalize_name("Dr. Jane Smith-Jones, PhD") == ["JANE", "JONES"]
    assert normalize_name("John Doe Jr.") == ["JOHN", "DOE"]
    assert normalize_name("john doe") == ["JOHN", "DOE"]


def test_normalize_name_ignores_middle_name():
    assert normalize_name("Jane A. Smith") == ["JANE", "SMITH"]


def test_normalize_npi_pads_and_rejects_zero():
    assert normalize_npi("1234567890") == "1234567890"
    assert normalize_npi(1234567890) == "1234567890"
    assert normalize_npi("0000000000") is None
    assert normalize_npi("Not Found") is None
    assert normalize_npi("") is None


def _record(**overrides):
    record = {
        "source": "TEST",
        "npi": None,
        "first": "",
        "last": "",
        "name": "",
        "dob": "",
        "city": "",
        "state": "",
        "exclusion_type": "",
        "exclusion_date": "",
    }
    record.update(overrides)
    return record


def test_match_workers_matches_on_npi():
    records = [_record(first="John", last="Doe", npi="1234567890")]
    workers = [{"name": "Someone Else", "email": "a@b.com", "npi": 1234567890}]

    matches = match_workers(workers, records)

    assert len(matches) == 1
    assert matches[0]["match_npi"] == "1234567890"


def test_match_workers_ignores_zero_npi():
    records = [_record(first="John", last="Doe")]
    workers = [{"name": "Someone Else", "email": "a@b.com", "npi": 0}]

    matches = match_workers(workers, records)

    assert len(matches) == 0


def test_match_workers_matches_on_normalized_name():
    records = [_record(first="Jane", last="Smith", name="Jane Smith")]
    workers = [{"name": "Dr. Jane Smith, PhD", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert len(matches) == 1
    assert matches[0]["match_name"] == "Jane Smith"


def test_match_workers_matches_ignoring_middle_name():
    records = [_record(first="Jane", last="Smith")]
    workers = [{"name": "Jane A. Smith", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert len(matches) == 1


def test_match_workers_skips_business_entries():
    records = [_record(first="", last="")]
    workers = [{"name": "No Match Here", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert len(matches) == 0


def test_match_workers_no_false_positive_on_different_name():
    records = [_record(first="Jane", last="Smith")]
    workers = [{"name": "John Doe", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert len(matches) == 0


def test_match_workers_handles_two_records_with_same_name():
    records = [
        _record(first="Jane", last="Smith", npi="1111111111"),
        _record(first="Jane", last="Smith", npi="2222222222"),
    ]
    workers = [{"name": "Jane Smith", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert len(matches) == 2
    assert {m["match_npi"] for m in matches} == {"1111111111", "2222222222"}


def test_match_workers_handles_npi_hit_and_different_name_hit():
    records = [
        _record(first="Person", last="Other", npi="1234567890"),
        _record(first="Jane", last="Smith"),
    ]
    workers = [{"name": "Jane Smith", "email": "a@b.com", "npi": 1234567890}]

    matches = match_workers(workers, records)

    assert len(matches) == 2


def test_match_workers_matches_across_sources():
    records = [
        _record(source="OIG LEIE", first="Jane", last="Smith"),
        _record(source="SC DHHS", first="Jane", last="Smith"),
    ]
    workers = [{"name": "Jane Smith", "email": "a@b.com", "npi": None}]

    matches = match_workers(workers, records)

    assert {m["source"] for m in matches} == {"OIG LEIE", "SC DHHS"}


def test_match_workers_screens_both_user_and_evaluator_names_for_same_email():
    # A user's Google display name can differ from their evaluator providerName,
    # so both rows for the same person must be screened, not just one.
    records = [_record(first="Jane", last="Smith")]
    workers = [
        {"name": "J. Smith", "email": "a@b.com", "npi": None},
        {"name": "Jane Smith, PhD", "email": "a@b.com", "npi": 1234567890},
    ]

    matches = match_workers(workers, records)

    assert len(matches) == 1


def test_dedupe_matches_collapses_same_worker_source_and_match():
    matches = [
        {
            "worker_email": "a@b.com",
            "source": "OIG LEIE",
            "match_name": "Jane Smith",
            "match_npi": "",
        },
        {
            "worker_email": "a@b.com",
            "source": "OIG LEIE",
            "match_name": "Jane Smith",
            "match_npi": "",
        },
    ]

    deduped = dedupe_matches(matches)

    assert len(deduped) == 1


def _sc_rows(*data_rows):
    return [
        ("Reviewed and Updated:  09/24/2026", None, None, None, None, None, None, None),
        (
            "South Carolina List of Sanctioned Individuals/Entities",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        ),
        (
            "Individual//Entity",
            "NPI",
            "City",
            "State",
            "Zip",
            "Last Known Profession/Provider Type",
            "Excluded/Terminated",
            "Action Date",
        ),
        *data_rows,
    ]


def test_parse_sc_rows_splits_last_first_and_reads_banner():
    rows = _sc_rows(
        (
            "Smith, Jane",
            "1234567890",
            "Columbia",
            "SC",
            "29201",
            "Ind-Lic HC Serv Prov",
            "Excluded",
            dt.datetime(2020, 1, 1),
        ),
    )

    records, banner = parse_sc_rows(rows)

    assert banner == "Reviewed and Updated:  09/24/2026"
    assert len(records) == 1
    assert records[0]["first"] == "Jane"
    assert records[0]["last"] == "Smith"
    assert records[0]["npi"] == "1234567890"
    assert records[0]["exclusion_date"] == "2020-01-01"


def test_parse_sc_rows_drops_credential_suffix_after_first_name():
    rows = _sc_rows(
        (
            "Doe, Jane, RN",
            "Not Found",
            "Columbia",
            "SC",
            "29201",
            "Ind-Lic HC Serv Prov",
            "Excluded",
            None,
        ),
    )

    records, _ = parse_sc_rows(rows)

    assert records[0]["first"] == "Jane"
    assert records[0]["last"] == "Doe"
    assert records[0]["npi"] is None


def test_parse_sc_rows_treats_no_comma_entry_as_unmatched_business():
    rows = _sc_rows(
        (
            "Acme Home Health LLC",
            "1234567890",
            "Columbia",
            "SC",
            "29201",
            "Other Business",
            "Terminated for Cause",
            None,
        ),
    )

    records, _ = parse_sc_rows(rows)

    assert records[0]["first"] == ""
    assert records[0]["last"] == ""
    assert records[0]["npi"] == "1234567890"


def test_parse_sc_rows_skips_blank_entity_rows():
    rows = _sc_rows(
        ("", None, None, None, None, None, None, None),
        (
            "Smith, Jane",
            "1234567890",
            "Columbia",
            "SC",
            "29201",
            "Ind-Lic HC Serv Prov",
            "Excluded",
            None,
        ),
    )

    records, _ = parse_sc_rows(rows)

    assert len(records) == 1


SAM_CSV_HEADER = (
    "classificationType,npi,firstName,lastName,entityName,exclusionType,"
    "exclusionProgram,exclusionPrimaryAddress:city,exclusionPrimaryAddress:stateOrProvinceCode"
)


def test_fetch_sam_exclusions_requires_api_key(monkeypatch):
    monkeypatch.delenv("SAM_GOV_API_KEY", raising=False)

    with pytest.raises(ValueError, match="SAM_GOV_API_KEY"):
        fetch_sam_exclusions()


def test_fetch_sam_exclusions_polls_until_ready_and_parses_csv(monkeypatch):
    monkeypatch.setenv("SAM_GOV_API_KEY", "test-key")

    kickoff_response = Mock()
    kickoff_response.json.return_value = {
        "message": "download at https://api.sam.gov/entity-information/v4/download-exclusions"
        "?api_key=REPLACE_WITH_API_KEY&token=abc123"
    }

    not_ready_response = Mock()
    not_ready_response.headers = {"Content-Type": "application/json"}

    csv_body = f"{SAM_CSV_HEADER}\nIndividual,1234567890,Jane,Smith,null,Ineligible,Reciprocal,Columbia,SC\n"
    ready_response = Mock()
    ready_response.headers = {"Content-Type": "text/csv"}
    ready_response.content = csv_body.encode()

    responses = [kickoff_response, not_ready_response, ready_response]

    with (
        patch("exclusion_check.requests.get", side_effect=responses) as mock_get,
        patch("exclusion_check.time.sleep"),
        patch("exclusion_check.SAM_EXCLUSIONS_MIN_ROWS", 1),
    ):
        records = fetch_sam_exclusions()

    poll_call = mock_get.call_args_list[-1]
    assert poll_call.kwargs["params"]["api_key"] == "test-key"
    assert poll_call.kwargs["params"]["token"] == "abc123"

    assert len(records) == 1
    assert records[0]["first"] == "Jane"
    assert records[0]["last"] == "Smith"
    assert records[0]["npi"] == "1234567890"


def test_fetch_sam_exclusions_redacts_api_key_on_error(monkeypatch):
    monkeypatch.setenv("SAM_GOV_API_KEY", "super-secret-key")

    with (
        patch(
            "exclusion_check.requests.get",
            side_effect=requests_module.RequestException(
                "boom for url https://api.sam.gov/x?api_key=super-secret-key"
            ),
        ),
        pytest.raises(RuntimeError) as exc_info,
    ):
        fetch_sam_exclusions()

    assert "super-secret-key" not in str(exc_info.value)
    assert "***" in str(exc_info.value)
