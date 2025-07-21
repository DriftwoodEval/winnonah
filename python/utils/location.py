import os
from typing import Callable, Literal, Optional

import pandas as pd
import requests
from dotenv import load_dotenv
from geopy import distance
from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim
from geopy.location import Location
from loguru import logger

load_dotenv()


def search_census(params: dict) -> tuple[str, dict] | None:
    response = requests.get(
        "https://geocoding.geo.census.gov/geocoder/geographies/address",
        params={**params, "api": os.getenv("CENSUS_API_KEY")},
    )
    response.raise_for_status()
    data = response.json()

    if data["result"]["addressMatches"]:
        district: str = data["result"]["addressMatches"][0]["geographies"][
            "Unified School Districts"
        ][0]["NAME"]
        coordinates = data["result"]["addressMatches"][0]["coordinates"]
        return district, coordinates
    else:
        return None


def get_client_census_data(client: pd.Series) -> tuple[str, dict] | Literal["Unknown"]:
    params = {
        "street": (
            str(client.USER_ADDRESS_ADDRESS1).strip()
            if not pd.isna(client.USER_ADDRESS_ADDRESS1)
            else None
        ),
        "city": (
            str(client.USER_ADDRESS_CITY).strip()
            if not pd.isna(client.USER_ADDRESS_CITY)
            else None
        ),
        "state": (
            str(client.USER_ADDRESS_STATE).strip()
            if not pd.isna(client.USER_ADDRESS_STATE)
            else None
        ),
        "zip": (
            str(client.USER_ADDRESS_ZIP).strip().rstrip("-")
            if not pd.isna(client.USER_ADDRESS_ZIP)
            else None
        ),
        "benchmark": "Public_AR_Current",
        "format": "json",
        "vintage": "Current_Current",
        "layers": 14,
    }

    if any(param is None for param in params.values()):
        logger.warning("Client address is incomplete, skipping district search.")
        return "Unknown"

    try:
        logger.debug(
            f"Searching for school district for {params['street']} {params['city']}, {params['state']} {params['zip']}"
        )
        census_data = search_census(params)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.warning("Search failed, attempting again without a ZIP code...")
        params_without_zip = params.copy()
        params_without_zip.pop("zip")
        census_data = search_census(params_without_zip)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.warning("Search failed again, attempting with ZIP but without city...")
        params_without_city = params.copy()
        params_without_city.pop("city")
        census_data = search_census(params_without_city)
        if census_data:
            return map_district_name(census_data[0]), census_data[1]

        logger.error("No district found.")
        return "Unknown"
    except requests.RequestException as e:
        logger.error(f"Error fetching school district data: {e}")
        return "Unknown"


def map_district_name(district: str) -> str:
    district_replacements = {
        "Bamberg County School District": "Bamberg",
        "Berkeley County School District": "Berkeley",
        "Charleston County School District": "Charleston",
        "Colleton County School District": "Colleton",
        "Dorchester School District 2": "DD2",
        "Dorchester School District 4": "DD4",
        "Georgetown County School District": "Georgetown",
        "Horry County School District": "Horry",
        "Orangeburg County School District": "Orangeburg",
        "Pickens County School District": "Pickens",
        "Richland School District 2": "Richland 2",
    }

    for old, new in district_replacements.items():
        district = district.replace(old, new)

    return district


GEOLOCATOR = Nominatim(user_agent="driftwood-winnonah")
geocode: Callable[[str], Optional[Location]] = RateLimiter(
    GEOLOCATOR.geocode, min_delay_seconds=2
)


def geocode_address(client: pd.Series) -> Location | None:
    logger.debug(f"Geocoding {client.ADDRESS}")

    street_address = (
        str(client.USER_ADDRESS_ADDRESS1).strip()
        if not pd.isna(client.USER_ADDRESS_ADDRESS1)
        else ""
    )

    city = (
        str(client.USER_ADDRESS_CITY).strip()
        if not pd.isna(client.USER_ADDRESS_CITY)
        else ""
    )
    state = (
        str(client.USER_ADDRESS_STATE).strip()
        if not pd.isna(client.USER_ADDRESS_STATE)
        else ""
    )
    zip = (
        str(client.USER_ADDRESS_ZIP).strip().rstrip("-")
        if not pd.isna(client.USER_ADDRESS_ZIP)
        else ""
    )

    attempt_string = client.ADDRESS
    if not any(char.isalnum() for char in attempt_string):
        return None
    geocoded_location = geocode(attempt_string)

    if geocoded_location is None and (
        not pd.isna(client.USER_ADDRESS_ADDRESS2)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS2.lower()
        or not pd.isna(client.USER_ADDRESS_ADDRESS3)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS3.lower()
    ):
        logger.warning(
            f"Location data not found for {attempt_string}, trying again with Address 2/3 removed"
        )
        attempt_string = " ".join([street_address, city, state, zip])
        geocoded_location = geocode(attempt_string)

    if geocoded_location is None:
        logger.warning(
            f"Location data not found for {attempt_string}, trying again without street number"
        )
        attempt_string = " ".join(attempt_string.split(" ")[1:])
        geocoded_location = geocode(attempt_string)

        if geocoded_location is None:
            logger.warning(
                f"Location data not found for {attempt_string}, trying again without street"
            )
            attempt_string = city + ", " + state + " " + zip
            geocoded_location = geocode(attempt_string)

            if geocoded_location is None:
                logger.warning(
                    f"Location data not found for {attempt_string}, trying again with just ZIP"
                )
                attempt_string = zip
                geocoded_location = geocode(attempt_string)

                if geocoded_location is None:
                    logger.error(f"Location data not found for {attempt_string}")
    if geocoded_location:
        logger.debug(
            f"Geocoded {attempt_string} to {geocoded_location.latitude}, {geocoded_location.longitude}"
        )
    return geocoded_location


def get_offices() -> dict:
    logger.debug("Getting offices")
    office_env = os.getenv("OFFICE_ADDRESSES")
    if office_env is None:
        raise ValueError("OFFICE_ADDRESSES not set")

    addresses = {}
    for address in office_env.split(";"):
        key, values = address.split(":")
        latitude, longitude, pretty_name = values.split(",")
        addresses[key] = {
            "latitude": latitude,
            "longitude": longitude,
            "pretty_name": pretty_name,
        }
    return addresses


OFFICES = get_offices()


def calculate_closest_offices(client: pd.Series, latitude: str, longitude: str) -> dict:
    closest_offices = []
    for office_name, office in OFFICES.items():
        miles = distance.distance(
            (latitude, longitude),
            (office["latitude"], office["longitude"]),
        ).miles
        logger.debug(
            f"{office_name} office is {int(miles)} miles away from {client.FIRSTNAME} {client.LASTNAME}"
        )
        closest_offices.append((office_name, int(miles)))
    closest_offices.sort(key=lambda x: x[1])
    return {
        "closest_office": closest_offices[0][0],
        "closest_office_miles": closest_offices[0][1],
        "second_closest_office": closest_offices[1][0],
        "second_closest_office_miles": closest_offices[1][1],
        "third_closest_office": closest_offices[2][0],
        "third_closest_office_miles": closest_offices[2][1],
    }


def get_closest_offices(client: pd.Series) -> dict:
    logger.debug(f"Getting closest office for {client['ADDRESS']}")

    if pd.isna(client.ADDRESS) or client.ADDRESS is None or client.ADDRESS == "":
        logger.error(f"{client.FIRSTNAME} {client.LASTNAME} has no address")
        return {
            "closest_office": "Unknown",
            "closest_office_miles": "Unknown",
            "second_closest_office": "Unknown",
            "second_closest_office_miles": "Unknown",
            "third_closest_office": "Unknown",
            "third_closest_office_miles": "Unknown",
        }

    if (
        "LATITUDE" in client
        and "LONGITUDE" in client
        and not pd.isna(client.LATITUDE)
        and not pd.isna(client.LONGITUDE)
    ):
        return calculate_closest_offices(client, client.LATITUDE, client.LONGITUDE)

    geocoded_location = geocode_address(client)
    if geocoded_location is None:
        logger.error(f"Location data not found for {client['ADDRESS']}")
        return {
            "closest_office": "Unknown",
            "closest_office_miles": "Unknown",
            "second_closest_office": "Unknown",
            "second_closest_office_miles": "Unknown",
            "third_closest_office": "Unknown",
            "third_closest_office_miles": "Unknown",
        }

    return calculate_closest_offices(
        client, geocoded_location.latitude, geocoded_location.longitude
    )
