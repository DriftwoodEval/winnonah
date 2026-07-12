import pandas as pd

from utils.relationships import (
    clean_insurance_item,
    explain_eligibility,
    match_by_insurance,
    match_by_school_district,
    summarize_no_match_reason,
)


class TestCleanInsuranceItem:
    def test_empty_bracket_string_returns_empty_list(self):
        assert clean_insurance_item("[]") == []

    def test_empty_input_returns_empty_list(self):
        assert clean_insurance_item("") == []

    def test_stringified_list_is_evaluated(self):
        assert clean_insurance_item('["Aetna"]') == ["Aetna"]

    def test_stringified_list_drops_nested_empty_brackets(self):
        assert clean_insurance_item('["Aetna", "[]"]') == ["Aetna"]

    def test_plain_string_becomes_single_item_list(self):
        assert clean_insurance_item("Aetna") == ["Aetna"]

    def test_invalid_bracket_syntax_falls_back_to_single_item(self):
        assert clean_insurance_item("[not valid python") == ["[not valid python"]

    def test_list_input_is_flattened_recursively(self):
        assert clean_insurance_item(["Aetna", '["BabyNet"]']) == ["Aetna", "BabyNet"]

    def test_unsupported_type_returns_empty_list(self):
        assert clean_insurance_item(123) == []


def make_client(**overrides):
    base = {
        "POLICY_PRIVATEPAY": 0,
        "INSURANCE_COMPANYNAME": None,
        "SECONDARY_INSURANCE_COMPANYNAME": None,
        "SCHOOL_DISTRICT": None,
        "ADDRESS": None,
        "DOB": None,
    }
    base.update(overrides)
    return pd.Series(base)


class TestMatchByInsurance:
    def test_private_pay_client_matches_all_evaluators(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        evaluators = {"111": {}, "222": {}}
        result = match_by_insurance(client, evaluators, {})
        assert set(result) == {"111", "222"}

    def test_matches_evaluator_accepting_primary_insurance(self):
        client = make_client(INSURANCE_COMPANYNAME="Aetna")
        evaluators = {
            "111": {"Aetna": True},
            "222": {"Aetna": False},
        }
        assert match_by_insurance(client, evaluators, {}) == ["111"]

    def test_uses_insurance_mappings_to_normalize_alias(self):
        client = make_client(INSURANCE_COMPANYNAME="AETNA BETTER HEALTH")
        evaluators = {"111": {"Aetna": True}}
        mappings = {"aetnabetterhealth": "Aetna"}
        assert match_by_insurance(client, evaluators, mappings) == ["111"]

    def test_no_recognized_insurance_matches_nobody(self):
        client = make_client(INSURANCE_COMPANYNAME="Unknown Co")
        evaluators = {"111": {"Aetna": True}}
        assert match_by_insurance(client, evaluators, {}) == []

    def test_babynet_requires_both_babynet_and_primary(self):
        client = make_client(
            INSURANCE_COMPANYNAME="Aetna",
            SECONDARY_INSURANCE_COMPANYNAME="BabyNet",
        )
        evaluators = {
            "accepts_both": {"Aetna": True, "BabyNet": True},
            "only_babynet": {"BabyNet": True},
            "only_primary": {"Aetna": True},
        }
        assert match_by_insurance(client, evaluators, {}) == ["accepts_both"]

    def test_babynet_as_primary_only_needs_babynet(self):
        client = make_client(INSURANCE_COMPANYNAME="BabyNet")
        evaluators = {"111": {"BabyNet": True}}
        assert match_by_insurance(client, evaluators, {}) == ["111"]

    def test_secondary_insurance_as_list_is_used(self):
        client = make_client(SECONDARY_INSURANCE_COMPANYNAME=["Aetna"])
        evaluators = {"111": {"Aetna": True}}
        assert match_by_insurance(client, evaluators, {}) == ["111"]

    def test_babynet_rejects_evaluator_accepting_neither(self):
        client = make_client(
            INSURANCE_COMPANYNAME="Aetna",
            SECONDARY_INSURANCE_COMPANYNAME="BabyNet",
        )
        evaluators = {"accepts_neither": {}}
        assert match_by_insurance(client, evaluators, {}) == []


class TestMatchBySchoolDistrict:
    def test_no_known_district_matches_all(self):
        client = make_client(SCHOOL_DISTRICT="unknown")
        evaluators = {"111": {}, "222": {}}
        assert set(match_by_school_district(client, evaluators)) == {"111", "222"}

    def test_blocked_district_excludes_evaluator(self):
        client = make_client(
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {
            "blocks_district": {"blockedSchoolDistricts": ["Richland One"]},
            "no_blocks": {},
        }
        assert match_by_school_district(client, evaluators) == ["no_blocks"]

    def test_blocked_zip_excludes_evaluator(self):
        client = make_client(
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {
            "blocks_zip": {"blockedZipCodes": ["29201"]},
            "no_blocks": {},
        }
        assert match_by_school_district(client, evaluators) == ["no_blocks"]

    def test_district_check_skipped_for_client_over_20(self):
        client = make_client(
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
            DOB="2000-01-01",
        )
        evaluators = {"blocks_district": {"blockedSchoolDistricts": ["Richland One"]}}
        assert match_by_school_district(client, evaluators) == ["blocks_district"]


class TestExplainEligibility:
    def test_excludes_archived_evaluators(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        evaluators = {"archived_one": {"archived": True}}
        result = explain_eligibility(client, evaluators, {})
        assert result["evaluators"] == []

    def test_reports_eligible_and_reason(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        evaluators = {"111": {"providerName": "Dr. Test"}}
        result = explain_eligibility(client, evaluators, {})
        [evaluator] = result["evaluators"]
        assert evaluator["eligible"] is True
        assert evaluator["insuranceReason"] == "Client is private pay"

    def test_client_context_reports_private_pay(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        result = explain_eligibility(client, {}, {})
        assert bool(result["clientContext"]["isPrivatePay"]) is True

    def test_reports_blocked_district(self):
        client = make_client(
            POLICY_PRIVATEPAY=1,
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {"111": {"blockedSchoolDistricts": ["Richland One"]}}
        [evaluator] = explain_eligibility(client, evaluators, {})["evaluators"]
        assert evaluator["districtEligible"] is False
        assert (
            evaluator["districtReason"] == "Evaluator has blocked district Richland One"
        )

    def test_reports_blocked_zip(self):
        client = make_client(
            POLICY_PRIVATEPAY=1,
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {"111": {"blockedZipCodes": ["29201"]}}
        [evaluator] = explain_eligibility(client, evaluators, {})["evaluators"]
        assert evaluator["districtEligible"] is False
        assert evaluator["districtReason"] == "Evaluator has blocked zip code 29201"

    def test_reports_no_district_restriction(self):
        client = make_client(
            POLICY_PRIVATEPAY=1,
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {"111": {}}
        [evaluator] = explain_eligibility(client, evaluators, {})["evaluators"]
        assert evaluator["districtEligible"] is True
        assert evaluator["districtReason"] == "No matching blocked district or zip code"


class TestSummarizeNoMatchReason:
    def test_returns_none_when_no_evaluators_at_all(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        assert summarize_no_match_reason(client, {}, {}) is None

    def test_returns_none_when_client_has_eligible_evaluator(self):
        client = make_client(POLICY_PRIVATEPAY=1)
        evaluators = {"111": {"providerName": "Dr. Test"}}
        assert summarize_no_match_reason(client, evaluators, {}) is None

    def test_reports_no_insurance_on_file(self):
        client = make_client()
        evaluators = {"111": {"Aetna": True}}
        assert (
            summarize_no_match_reason(client, evaluators, {}) == "No insurance on file"
        )

    def test_reports_unaccepted_insurance(self):
        client = make_client(INSURANCE_COMPANYNAME="Unknown Co")
        evaluators = {"111": {"Aetna": True}}
        assert (
            summarize_no_match_reason(client, evaluators, {})
            == "No evaluators accept: Unknown Co"
        )

    def test_reports_all_evaluators_block_district(self):
        client = make_client(
            POLICY_PRIVATEPAY=1,
            SCHOOL_DISTRICT="Richland One",
            ADDRESS="123 Main St 29201",
        )
        evaluators = {"111": {"blockedSchoolDistricts": ["Richland One"]}}
        assert (
            summarize_no_match_reason(client, evaluators, {})
            == "All evaluators block district: Richland One"
        )
