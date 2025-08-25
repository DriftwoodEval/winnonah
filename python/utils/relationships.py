import pandas as pd

from utils.misc import get_column


def match_by_insurance(client: pd.Series, evaluators: dict):
    """Matches evaluators to a client based on insurance information.

    An evaluator is considered eligible if they accept the client's
    primary insurance, secondary insurance, or if the client is private pay.

    Args:
        client (pd.Series): A pandas Series representing a single client.
        evaluators (dict): A dictionary of all evaluators, keyed by NPI.

    Returns:
        list: A list of NPIs for evaluators who are eligible for the client.
    """
    # logger.debug(
    #     f"Matching evaluators by insurance for {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')}"
    # )

    is_private_pay = get_column(client, "POLICY_PRIVATEPAY") == 1

    # Check for private pay first. If true, all evaluators are eligible.
    if is_private_pay:
        # logger.debug("Client is private pay, all evaluators are eligible.")
        return list(evaluators.keys())

    eligible_evaluator_npis = set()
    primary_insurance = get_column(client, "INSURANCE_COMPANYNAME")
    secondary_insurance = get_column(client, "SECONDARY_INSURANCE_COMPANYNAME")

    insurances_to_check = [primary_insurance]
    if isinstance(secondary_insurance, str):
        insurances_to_check.extend(
            [name.strip() for name in secondary_insurance.split(",")]
        )
    elif isinstance(secondary_insurance, list):
        insurances_to_check.extend(secondary_insurance)

    for npi, evaluator_data in evaluators.items():
        evaluator_name = evaluator_data.get("providerName", "Unknown Evaluator")
        # Check for matching insurance
        for insurance in insurances_to_check:
            # The client's insurance name should match a boolean column in the evaluator data
            if isinstance(insurance, str) and evaluator_data.get(insurance, False):
                # logger.debug(f"{evaluator_name} accepts {insurance}.")
                eligible_evaluator_npis.add(npi)
                break  # Break out of the inner loop once a match is found for this evaluator

    return list(eligible_evaluator_npis)


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
    client_school_district = get_column(client, "SCHOOL_DISTRICT")

    # logger.debug(
    #     f"Matching evaluators by school district for {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')}"
    # )

    if not isinstance(
        client_school_district, str
    ) or client_school_district.lower() in ["unknown", "n/a", "no", None]:
        # logger.debug(
        #     f"{get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')} has no valid school district information. No exclusions applied. All evaluators are eligible."
        # )
        return list(evaluators.keys())

    eligible_evaluators = []
    client_district_lower = client_school_district.lower().strip()

    for npi, evaluator_data in evaluators.items():
        evaluator_name = evaluator_data.get("providerName", "Unknown Evaluator")
        blocked_districts = evaluator_data.get("blockedSchoolDistricts", [])

        is_blocked = False
        for blocked_name in blocked_districts:
            if client_district_lower == blocked_name.lower().strip():
                is_blocked = True
                # logger.debug(
                #     f"Evaluator {evaluator_name} ({npi}) CANNOT work in {client_school_district}."
                # )
                break

        if not is_blocked:
            eligible_evaluators.append(npi)
            # logger.debug(
            #     f"Evaluator {evaluator_name} can work with {client_school_district}."
            # )

    return eligible_evaluators
