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

import utils.database

load_dotenv()


def _search_census(params: dict) -> tuple[str, dict] | None:
    """Searches for a given address in the Census API and returns the associated school district and coordinates if found."""
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
    """Searches for a client's address in the Census API, removing portions and re-attempting if necessary, and returns the associated school district and coordinates if found."""
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
        census_data = _search_census(params)
        if census_data:
            return census_data[0], census_data[1]

        logger.warning("Search failed, attempting again without a ZIP code...")
        params_without_zip = params.copy()
        params_without_zip.pop("zip")
        census_data = _search_census(params_without_zip)
        if census_data:
            return census_data[0], census_data[1]

        logger.warning("Search failed again, attempting with ZIP but without city...")
        params_without_city = params.copy()
        params_without_city.pop("city")
        census_data = _search_census(params_without_city)
        if census_data:
            return census_data[0], census_data[1]

        logger.error("No district found.")
        return "Unknown"
    except requests.RequestException as e:
        logger.error(f"Error fetching school district data: {e}")
        return "Unknown"


GEOLOCATOR = Nominatim(user_agent="driftwood-winnonah")
geocode: Callable[[str], Optional[Location]] = RateLimiter(
    GEOLOCATOR.geocode, min_delay_seconds=2
)


def _geocode_address(client: pd.Series) -> Location | None:
    """Geocodes a client's address, decreasing in specificity and tryimng again if necessary, and returns the coordinates if found."""
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
        old_attempt_string = attempt_string
        attempt_string = " ".join([street_address, city, state, zip])
        logger.warning(
            f"Location data not found for {old_attempt_string}, trying again with Address 2/3 removed: {attempt_string}"
        )
        geocoded_location = geocode(attempt_string)

    if geocoded_location is None:
        old_attempt_string = attempt_string
        attempt_string = " ".join(attempt_string.split(" ")[1:])
        logger.warning(
            f"Location data not found for {old_attempt_string}, trying again without street number: {attempt_string}"
        )
        geocoded_location = geocode(attempt_string)

        if geocoded_location is None:
            old_attempt_string = attempt_string
            attempt_string = city + ", " + state + " " + zip
            logger.warning(
                f"Location data not found for {old_attempt_string}, trying again without street: {attempt_string}"
            )
            geocoded_location = geocode(attempt_string)

            if geocoded_location is None:
                old_attempt_string = attempt_string
                attempt_string = zip
                logger.warning(
                    f"Location data not found for {old_attempt_string}, trying again with just ZIP: {attempt_string}"
                )
                geocoded_location = geocode(attempt_string)

                if geocoded_location is None:
                    logger.error(f"Location data not found for {attempt_string}")
    if geocoded_location:
        logger.debug(
            f"Geocoded {attempt_string} to {geocoded_location.latitude}, {geocoded_location.longitude}"
        )
    return geocoded_location


def get_offices() -> dict:
    """Fetches all office locations from the database."""
    logger.debug("Getting offices from the database")
    db_connection = utils.database.get_db()
    addresses = {}

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = "SELECT `key`, latitude, longitude, prettyName FROM emr_office"
            cursor.execute(sql)

            results = cursor.fetchall()
            if not results:
                logger.warning("No offices found in the database.")
                return addresses

            for row in results:
                addresses[row["key"]] = {
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "pretty_name": row["prettyName"],
                }
    return addresses


def _calculate_closest_offices(
    client: pd.Series, latitude: str, longitude: str
) -> dict:
    """Calculates the closest offices to a client's address, using their latitude and longitude that have been geocoded."""
    offices = get_offices()
    closest_offices = []
    for office_name, office in offices.items():
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
    """Geocode and calculate the closest offices to a client's address."""
    logger.debug(
        f"Getting closest office for {client['FIRSTNAME']} {client['LASTNAME']}"
    )

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
        return _calculate_closest_offices(client, client.LATITUDE, client.LONGITUDE)

    geocoded_location = _geocode_address(client)
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

    return _calculate_closest_offices(
        client, geocoded_location.latitude, geocoded_location.longitude
    )


def add_census_data(client):
    """Gets the school district and coordinates for a client from the Census API, for use in .apply."""
    census_result = get_client_census_data(client)
    if census_result != "Unknown":
        district_name, coordinates = census_result
        return pd.Series(
            {
                "SCHOOL_DISTRICT": district_name,
                "LATITUDE": coordinates.get("y")
                if isinstance(coordinates, dict)
                else None,
                "LONGITUDE": coordinates.get("x")
                if isinstance(coordinates, dict)
                else None,
            }
        )
    else:
        return pd.Series(
            {"SCHOOL_DISTRICT": "Unknown", "LATITUDE": None, "LONGITUDE": None}
        )
