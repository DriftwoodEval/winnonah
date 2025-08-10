import re

import pandas as pd
from loguru import logger
from utils.misc import get_column


def match_by_insurance(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by insurance for {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')}"
    )
    eligible_evaluators = []

    is_private_pay = get_column(client, "POLICY_PRIVATEPAY") == 1
    primary_insurance = get_column(client, "INSURANCE_COMPANYNAME")
    secondary_insurance = get_column(client, "SECONDARY_INSURANCE_COMPANYNAME")

    for evaluator, data in evaluators.items():
        if is_private_pay:
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if primary_insurance and primary_insurance in data and data[primary_insurance]:
            logger.debug(f"{evaluator} takes {client.INSURANCE_COMPANYNAME}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if secondary_insurance:
            secondary_insurance_names = (
                secondary_insurance.split(",")
                if isinstance(secondary_insurance, str)
                else secondary_insurance
            )

            for sec_insurance_name in secondary_insurance_names:
                if (
                    sec_insurance_name
                    and sec_insurance_name in data
                    and data[sec_insurance_name]
                ):
                    logger.debug(f"{evaluator} takes {sec_insurance_name}")
                    if evaluator not in eligible_evaluators:
                        eligible_evaluators.append(evaluator)

    return eligible_evaluators


def match_by_school_district(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by school district for {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')}"
    )

    client_school_district = get_column(client, "SCHOOL_DISTRICT")
    client_district_lower = None
    if isinstance(client_school_district, str):
        client_district_lower = client_school_district.lower()

    if client_school_district is None or client_school_district == "Unknown":
        logger.warning(
            f"Client {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')} has no school district, adding all evaluators for now"
        )
        return list(evaluators.keys())

    processed_evaluators = {}
    for evaluator, data in evaluators.items():
        district_info = get_column(data, "DistrictInfo")
        if isinstance(district_info, str):
            # remove text in parentheses and convert to lowercase
            processed_district_info = re.sub(r"\s*\([^)]*\)", "", district_info).strip()
            # replace no with a blank string to handle it as an exclusion
            processed_district_info = (
                processed_district_info.lower().replace("no", "").strip()
            )
            processed_evaluators[evaluator] = processed_district_info
        else:
            processed_evaluators[evaluator] = ""

    eligible_evaluators = []
    for evaluator, data in evaluators.items():
        processed_district_info = processed_evaluators.get(evaluator, "")
        if processed_district_info == "all":
            logger.debug(f"{evaluator} is ok for {client_school_district}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)
        elif client_district_lower not in processed_district_info:
            logger.debug(f"{evaluator} is ok for {client_school_district}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

    return eligible_evaluators


def match_by_office(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by office for {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')}"
    )

    client_closest_office = get_column(client, "CLOSEST_OFFICE")
    client_closest_office_lower = None

    if not isinstance(client_closest_office, str) or client_closest_office in (
        "Unknown",
        "",
    ):
        logger.warning(
            f"Client {get_column(client, 'FIRSTNAME')} {get_column(client, 'LASTNAME')} has no closest office, adding all evaluators for now"
        )
        return list(evaluators.keys())

    client_closest_office_lower = client_closest_office.lower()
    eligible_evaluators = []

    for evaluator, data in evaluators.items():
        evaluator_offices = get_column(data, "Offices", default="")
        if isinstance(evaluator_offices, str):
            evaluator_offices_lower = evaluator_offices.lower()
            if (
                evaluator_offices_lower == "all"
                or client_closest_office_lower in evaluator_offices_lower
            ):
                logger.debug(f"{evaluator} is ok for {client_closest_office}")
                if evaluator not in eligible_evaluators:
                    eligible_evaluators.append(evaluator)

    return eligible_evaluators
