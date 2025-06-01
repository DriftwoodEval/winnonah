import re

import pandas as pd
from loguru import logger


def match_by_insurance(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by insurance for {client.FIRSTNAME} {client.LASTNAME}"
    )
    eligible_evaluators = []

    for evaluator, data in evaluators.items():
        if client.POLICY_PRIVATEPAY == 1:
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if client.INSURANCE_COMPANYNAME in data and data[client.INSURANCE_COMPANYNAME]:
            logger.debug(f"{evaluator} takes {client.INSURANCE_COMPANYNAME}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

        if client.SECONDARY_INSURANCE_COMPANYNAME:
            secondary_insurance_names = (
                client.SECONDARY_INSURANCE_COMPANYNAME.split(",")
                if isinstance(client.SECONDARY_INSURANCE_COMPANYNAME, str)
                else client.SECONDARY_INSURANCE_COMPANYNAME
            )

            for secondary_insurance in secondary_insurance_names:
                if secondary_insurance in data and data[secondary_insurance]:
                    logger.debug(f"{evaluator} takes {secondary_insurance}")
                    if evaluator not in eligible_evaluators:
                        eligible_evaluators.append(evaluator)

    return eligible_evaluators


def match_by_school_district(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by school district for {client.FIRSTNAME} {client.LASTNAME}"
    )
    if client.SCHOOL_DISTRICT == "Unknown":
        logger.warning(
            f"Client {client.FIRSTNAME} {client.LASTNAME} has no school district, adding all evaluators for now"
        )
        return list(evaluators.keys())

    for evaluator, data in evaluators.items():
        data["DistrictInfo"] = re.sub(r"\s*\([^)]*\)", "", data["DistrictInfo"]).strip()
        data["DistrictInfo"].lower().replace("no", "").strip()

    eligible_evaluators = []
    for evaluator, data in evaluators.items():
        if data["DistrictInfo"].lower() == "all":
            logger.debug(f"{evaluator} is ok for {client.SCHOOL_DISTRICT}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)
        if client.SCHOOL_DISTRICT.lower() not in data["DistrictInfo"].lower():
            logger.debug(f"{evaluator} is ok for {client.SCHOOL_DISTRICT}")
            if evaluator not in eligible_evaluators:
                eligible_evaluators.append(evaluator)

    return eligible_evaluators


def match_by_office(client: pd.Series, evaluators: dict):
    logger.debug(
        f"Matching evaluators by office for {client.FIRSTNAME} {client.LASTNAME}"
    )
    if client.CLOSEST_OFFICE == "Unknown":
        logger.warning(
            f"Client {client.FIRSTNAME} {client.LASTNAME} has no closest office, adding all evaluators for now"
        )
        return list(evaluators.keys())

    eligible_evaluators = []
    for evaluator, data in evaluators.items():
        if isinstance(data["Offices"], str):
            if (
                client.CLOSEST_OFFICE.lower() in data["Offices"].lower()
                or data["Offices"].lower() == "all".lower()
            ):
                logger.debug(f"{evaluator} is ok for {client.CLOSEST_OFFICE}")
                if evaluator not in eligible_evaluators:
                    eligible_evaluators.append(evaluator)

    return eligible_evaluators
