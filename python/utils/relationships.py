import ast
from datetime import datetime

import pandas as pd

from utils.misc import get_column


def _normalize_insurance_name(name: str, standardized_mappings: dict[str, str]) -> str:
    """Helper function to convert insurance names to a normalized, matchable format using database mappings."""
    if not isinstance(name, str) or not name:
        return ""

    # Normalize for lookup: lowercase and remove all whitespace
    normalized_for_lookup = "".join(name.lower().split())

    # Return the mapped shortName if found, otherwise return the original (cleaned) name
    return standardized_mappings.get(normalized_for_lookup, name)


def clean_insurance_item(item: str) -> list:
    """
    Handles:
    - "[]" -> None/Empty
    - '["Value"]' -> ["Value"]
    - "Normal String" -> ["Normal String"]"""
    if not item or item == "[]":
        return []

    if isinstance(item, str):
        item = item.strip()
        if item.startswith("[") and item.endswith("]"):
            try:
                evaluated = ast.literal_eval(item)
                # If the result is a list, process its contents
                if isinstance(evaluated, list):
                    return [str(i) for i in evaluated if i != "[]"]
            except (ValueError, SyntaxError):
                pass

        return [item]

    if isinstance(item, list):
        # Recursively clean items inside the list to handle nested stringified lists
        flattened = []
        for i in item:
            flattened.extend(clean_insurance_item(i))
        return flattened

    return []


def _get_standardized_client_insurances(
    client: pd.Series, insurance_mappings: dict
) -> set[str]:
    """Normalizes a client's primary and secondary insurance names using database mappings."""
    standardized_mappings = {
        "".join(k.lower().split()): v for k, v in insurance_mappings.items()
    }

    primary_insurance = get_column(client, "INSURANCE_COMPANYNAME")
    secondary_insurance = get_column(client, "SECONDARY_INSURANCE_COMPANYNAME")

    raw_insurances_to_check = []
    if primary_insurance:
        raw_insurances_to_check.append(primary_insurance)

    if isinstance(secondary_insurance, str) and secondary_insurance.strip() != "[]":
        raw_insurances_to_check.extend(clean_insurance_item(secondary_insurance))
    elif isinstance(secondary_insurance, list):
        raw_insurances_to_check.extend(secondary_insurance)

    standardized_client_insurances: set[str] = set()
    for raw_name in raw_insurances_to_check:
        normalized_name = _normalize_insurance_name(
            str(raw_name), standardized_mappings
        )
        if normalized_name:
            standardized_client_insurances.add(normalized_name)

    return standardized_client_insurances


def _get_client_age(client: pd.Series) -> int | None:
    """Returns the client's age in years, or None if DOB is unavailable."""
    client_dob = get_column(client, "DOB")
    if client_dob is None or not isinstance(client_dob, str):
        return None

    client_dob = datetime.strptime(client_dob, "%Y-%m-%d")
    current_date = datetime.now()
    return (
        current_date.year
        - client_dob.year
        - ((current_date.month, current_date.day) < (client_dob.month, client_dob.day))
    )


def _district_check_applies(client: pd.Series) -> tuple[bool, str | None]:
    """Determines whether school-district/zip blocking applies to this client.

    Returns a tuple of (applies, skip_reason). skip_reason is None when applies is True.
    """
    client_school_district = get_column(client, "SCHOOL_DISTRICT")
    client_address = get_column(client, "ADDRESS")

    district_known = (
        isinstance(client_school_district, str)
        and client_school_district.lower() not in ["unknown", "n/a", "no", None]
        and isinstance(client_address, str)
    )
    if not district_known:
        return False, "School district is unknown or client has no address on file"

    client_age = _get_client_age(client)
    if client_age is not None and client_age > 20:
        return False, f"Client is over 20 years old (age {client_age})"

    return True, None


def match_by_insurance(client: pd.Series, evaluators: dict, insurance_mappings: dict):
    """Matches evaluators to a client based on insurance information.

    An evaluator is considered eligible if they accept the client's
    primary insurance, secondary insurance, or if the client is private pay.

    Args:
        client (pd.Series): A pandas Series representing a single client.
        evaluators (dict): A dictionary of all evaluators, keyed by NPI.
        insurance_mappings (dict): A dictionary of alias -> shortName mappings.

    Returns:
        list: A list of NPIs for evaluators who are eligible for the client.
    """
    is_private_pay = get_column(client, "POLICY_PRIVATEPAY") == 1

    if is_private_pay:
        return list(evaluators.keys())

    standardized_client_insurances = _get_standardized_client_insurances(
        client, insurance_mappings
    )

    eligible_evaluator_npis = set()

    for npi, evaluator_data in evaluators.items():
        is_eligible = False
        for insurance in standardized_client_insurances:
            if evaluator_data.get(insurance):
                is_eligible = True
                break

        if is_eligible:
            eligible_evaluator_npis.add(npi)

    return list(eligible_evaluator_npis)


def explain_eligibility(
    client: pd.Series, evaluators: dict, insurance_mappings: dict
) -> dict:
    """Computes eligibility for every evaluator against a client, with a reason per criterion.

    Mirrors the logic in match_by_insurance and match_by_school_district, but returns
    a human-readable breakdown instead of just the eligible NPIs, for debugging why a
    client has few or no eligible evaluators. Keep this in sync with those functions.

    Args:
        client (pd.Series): A pandas Series representing a single client.
        evaluators (dict): A dictionary of all evaluators, keyed by NPI.
        insurance_mappings (dict): A dictionary of alias -> shortName mappings.

    Returns:
        dict: {"clientContext": {...}, "evaluators": [{"npi", "name", "archived",
              "insuranceEligible", "insuranceReason", "districtEligible",
              "districtReason", "eligible"}, ...]}
    """
    is_private_pay = get_column(client, "POLICY_PRIVATEPAY") == 1
    standardized_client_insurances = _get_standardized_client_insurances(
        client, insurance_mappings
    )

    client_school_district = get_column(client, "SCHOOL_DISTRICT")
    client_address = get_column(client, "ADDRESS")
    client_zip = (
        client_address.split(" ")[-1] if isinstance(client_address, str) else None
    )
    client_age = _get_client_age(client)
    district_check_applies, district_skip_reason = _district_check_applies(client)
    district_check_skipped = not district_check_applies

    client_context = {
        "isPrivatePay": is_private_pay,
        "standardizedInsurances": sorted(standardized_client_insurances),
        "schoolDistrict": client_school_district
        if isinstance(client_school_district, str)
        else None,
        "zip": client_zip,
        "age": client_age,
        "districtCheckSkipped": district_check_skipped,
        "districtSkipReason": district_skip_reason,
    }

    client_district_lower = (
        client_school_district.lower().strip()
        if isinstance(client_school_district, str)
        else ""
    )

    evaluator_results = []
    for npi, evaluator_data in evaluators.items():
        if evaluator_data.get("archived"):
            continue

        if is_private_pay:
            insurance_eligible = True
            insurance_reason = "Client is private pay"
        else:
            matched_insurance = next(
                (
                    insurance
                    for insurance in standardized_client_insurances
                    if evaluator_data.get(insurance)
                ),
                None,
            )
            insurance_eligible = matched_insurance is not None
            if insurance_eligible:
                insurance_reason = f"Evaluator accepts {matched_insurance}"
            elif not standardized_client_insurances:
                insurance_reason = "Client has no recognized insurance on file"
            else:
                insurance_reason = f"Evaluator does not accept {', '.join(sorted(standardized_client_insurances))}"

        if district_check_skipped:
            district_eligible = True
            district_reason = district_skip_reason or "No district restrictions apply"
        else:
            blocked_districts = evaluator_data.get("blockedSchoolDistricts", [])
            blocked_zips = evaluator_data.get("blockedZipCodes", [])

            blocked_district_match = next(
                (
                    blocked_name
                    for blocked_name in blocked_districts
                    if client_district_lower == blocked_name.lower().strip()
                ),
                None,
            )
            blocked_zip_match = (
                not blocked_district_match and client_zip in blocked_zips
            )

            if blocked_district_match:
                district_eligible = False
                district_reason = (
                    f"Evaluator has blocked district {blocked_district_match}"
                )
            elif blocked_zip_match:
                district_eligible = False
                district_reason = f"Evaluator has blocked zip code {client_zip}"
            else:
                district_eligible = True
                district_reason = "No matching blocked district or zip code"

        evaluator_results.append(
            {
                "npi": npi,
                "name": evaluator_data.get("providerName"),
                "archived": evaluator_data.get("archived"),
                "insuranceEligible": insurance_eligible,
                "insuranceReason": insurance_reason,
                "districtEligible": district_eligible,
                "districtReason": district_reason,
                "eligible": insurance_eligible and district_eligible,
            }
        )

    return {"clientContext": client_context, "evaluators": evaluator_results}


def summarize_no_match_reason(
    client: pd.Series, evaluators: dict, insurance_mappings: dict
) -> str | None:
    """Short human-readable reason a client has no eligible evaluators, or None if they have some.

    Built on top of explain_eligibility so this stays in sync with the actual
    per-evaluator matching rules instead of reimplementing them.
    """
    result = explain_eligibility(client, evaluators, insurance_mappings)
    context = result["clientContext"]
    evaluator_results = result["evaluators"]

    if not evaluator_results:
        return None

    reasons = []

    if not context["isPrivatePay"] and all(
        not e["insuranceEligible"] for e in evaluator_results
    ):
        if not context["standardizedInsurances"]:
            reasons.append("No insurance on file")
        else:
            accepted = ", ".join(context["standardizedInsurances"])
            reasons.append(f"No evaluators accept: {accepted}")

    if not context["districtCheckSkipped"] and all(
        not e["districtEligible"] for e in evaluator_results
    ):
        reasons.append(f"All evaluators block district: {context['schoolDistrict']}")

    return " / ".join(reasons) if reasons else None


def match_by_school_district(client: pd.Series, evaluators: dict):
    """Matches evaluators to a client based on school district.

    This function iterates through all evaluators and adds them to a list
    of eligible evaluators if the client's school district is NOT in their
    list of blocked districts.

    Args:
        client (pd.Series): A pandas Series representing a single client.
        evaluators (dict): A dictionary of all evaluators, keyed by NPI,
                           with their details and lists of blocked locations.

    Returns:
        list: A list of NPIs for evaluators who are eligible for the client.
    """
    district_check_applies, _ = _district_check_applies(client)
    if not district_check_applies:
        return list(evaluators.keys())

    client_school_district = get_column(client, "SCHOOL_DISTRICT")
    client_address = get_column(client, "ADDRESS")
    client_zip = client_address.split(" ")[-1] if client_address else None

    eligible_evaluators = []
    client_district_lower = client_school_district.lower().strip()

    for npi, evaluator_data in evaluators.items():
        blocked_districts = evaluator_data.get("blockedSchoolDistricts", [])
        blocked_zips = evaluator_data.get("blockedZipCodes", [])

        is_blocked = False

        for blocked_name in blocked_districts:
            if client_district_lower == blocked_name.lower().strip():
                is_blocked = True
                break

        if not is_blocked:
            for blocked_zip in blocked_zips:
                if client_zip == blocked_zip:
                    is_blocked = True
                    break

        if not is_blocked:
            eligible_evaluators.append(npi)

    return eligible_evaluators
