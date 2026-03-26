import math
import os
from collections.abc import Callable
from functools import partial
from typing import Literal

import geopandas as gpd
import geopy.geocoders
import pandas as pd
import requests
from dotenv import load_dotenv
from geocodio import Geocodio
from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim
from geopy.location import Location
from loguru import logger
from shapely import Point

import utils.database
from utils.constants import TABLE_OFFICE

load_dotenv()


def calculate_spherical_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculates distance in miles using the Spherical Law of Cosines, matching the database implementation."""
    try:
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        delta_lambda = math.radians(lon2 - lon1)

        cos_c = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(
            phi2
        ) * math.cos(delta_lambda)

        # Clamp cos_c to [-1, 1] to avoid math domain error in acos
        cos_c = max(-1.0, min(1.0, cos_c))

        return math.acos(cos_c) * 3959
    except Exception as e:
        logger.error(f"Error calculating distance: {e}")
        return 0.0


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


def _get_client_census_data(client: pd.Series) -> tuple[str, dict] | Literal["Unknown"]:
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
            logger.debug(f"Found school district: {census_data[0]}")
            return census_data[0], census_data[1]

        logger.warning("Search failed, attempting again without a ZIP code...")
        params_without_zip = params.copy()
        params_without_zip.pop("zip")
        census_data = _search_census(params_without_zip)
        if census_data:
            logger.debug(f"Found school district: {census_data[0]}")
            return census_data[0], census_data[1]

        logger.warning("Search failed again, attempting with ZIP but without city...")
        params_without_city = params.copy()
        params_without_city.pop("city")
        census_data = _search_census(params_without_city)
        if census_data:
            logger.debug(f"Found school district: {census_data[0]}")
            return census_data[0], census_data[1]

        logger.error("No district found.")
        return "Unknown"
    except requests.RequestException as e:
        logger.error(f"Error fetching school district data: {e}")
        return "Unknown"


geocodio_client = Geocodio(os.getenv("GEOCODIO_API_KEY", ""))


def _search_geocodio(full_address: str) -> tuple[str, float, float] | None:
    """Searches Geocodio for address, coordinates, and school district."""
    if not os.getenv("GEOCODIO_API_KEY"):
        logger.warning("GEOCODIO_API_KEY is not set, skipping Geocodio")
        return None

    try:
        logger.debug(f"Searching Geocodio for: {full_address}")
        response = geocodio_client.geocode(full_address, fields=["school"])

        if not response.results:
            return None

        best_match = response.results[0]
        lat = best_match.location.lat
        lon = best_match.location.lng

        district = "Unknown"

        fields = best_match.fields
        districts_obj = fields.school_districts if fields else None

        if districts_obj:
            district = districts_obj[0].name

        logger.debug(f"Found {district}, {lat}, {lon} for {full_address}")
        return district, lat, lon
    except Exception as e:
        logger.error(f"Geocodio error: {e}")
        return None


geopy.geocoders.options.default_timeout = 7
geopy.geocoders.options.default_user_agent = "driftwood-winnonah"
GEOLOCATOR = Nominatim()
geocode_us = partial(GEOLOCATOR.geocode, country_codes="us")
geocode: Callable[[str], Location | None] = RateLimiter(geocode_us, min_delay_seconds=2)


def _geocode_address(client: pd.Series) -> tuple[Location | None, int]:
    """Geocodes a client's address, decreasing in specificity and trying again if necessary, and returns the coordinates if found."""
    if pd.isna(client.ADDRESS):
        return None, 0

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

    attempt_count = 1
    attempt_string = client.ADDRESS
    if not any(char.isalnum() for char in attempt_string):
        return None, 0
    geocoded_location = geocode(attempt_string)

    if geocoded_location is None and (
        not pd.isna(client.USER_ADDRESS_ADDRESS2)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS2.lower()
        or not pd.isna(client.USER_ADDRESS_ADDRESS3)
        and client.USER_ADDRESS_ADDRESS1.lower() != client.USER_ADDRESS_ADDRESS3.lower()
    ):
        old_attempt_string = attempt_string
        attempt_string = " ".join([street_address, city, state, zip])
        # Don't increase attempt count here, since apartments and suites would not change your school district
        logger.warning(
            f"Location data not found for {old_attempt_string}, trying again with Address 2/3 removed: {attempt_string}"
        )
        geocoded_location = geocode(attempt_string)

    if geocoded_location is None:
        old_attempt_string = attempt_string
        attempt_string = " ".join(attempt_string.split(" ")[1:])
        attempt_count += 1
        logger.warning(
            f"Location data not found for {old_attempt_string}, trying again without street number: {attempt_string}"
        )
        geocoded_location = geocode(attempt_string)

        if geocoded_location is None:
            old_attempt_string = attempt_string
            attempt_string = city + ", " + state + " " + zip
            attempt_count += 1
            logger.warning(
                f"Location data not found for {old_attempt_string}, trying again without street: {attempt_string}"
            )
            geocoded_location = geocode(attempt_string)

            if geocoded_location is None:
                old_attempt_string = attempt_string
                attempt_string = zip
                attempt_count += 1
                logger.warning(
                    f"Location data not found for {old_attempt_string}, trying again with just ZIP: {attempt_string}"
                )
                geocoded_location = geocode(attempt_string)

                if geocoded_location is None:
                    logger.error(f"Location data not found for {attempt_string}")

    if geocoded_location:
        logger.debug(
            f"Geocoded {attempt_string} to {geocoded_location.latitude}, {geocoded_location.longitude} in {attempt_count} attempt{'s' if attempt_count > 1 else ''}."
        )
    return geocoded_location, attempt_count


def _get_school_district_from_coords(lat: float, lon: float) -> str:
    """Identifies the school district for a given latitude and longitude using a shapefile."""
    gdf = gpd.read_file("shapefiles/school_district_boundaries.shp")

    point = Point(lon, lat)

    # Check which polygon from the shapefile contains the point
    # The result is a GeoDataFrame with the rows that match the condition
    containing_district = gdf[gdf.contains(point)]

    if not containing_district.empty:
        logger.debug(f"Found {containing_district.iloc[0]['NAME']} for {lat}, {lon}")
        return containing_district.iloc[0]["NAME"]
    else:
        return "Unknown"


def get_offices() -> dict:
    """Fetches all office locations from the database."""
    logger.debug("Getting offices from the database")
    db_connection = utils.database.get_db()
    addresses = {}

    with db_connection:
        with db_connection.cursor() as cursor:
            sql = f"SELECT `key`, latitude, longitude, prettyName FROM {TABLE_OFFICE}"
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


def add_location_data(client: pd.Series) -> pd.Series:
    """Gets the school district and coordinates for a client, for use in .apply."""
    census_result = _get_client_census_data(client)
    if census_result != "Unknown":
        dist, coords = census_result
        if isinstance(coords, dict):
            lat, lon = float(coords["y"]), float(coords["x"])

            return pd.Series(
                {
                    "SCHOOL_DISTRICT": dist,
                    "LATITUDE": lat,
                    "LONGITUDE": lon,
                    "FLAG": None,
                }
            )

    addr_str = str(client.ADDRESS) if not pd.isna(client.ADDRESS) else ""
    if addr_str:
        geocodio_res = _search_geocodio(addr_str)
        if geocodio_res:
            dist, lat, lon = geocodio_res
            return pd.Series(
                {
                    "SCHOOL_DISTRICT": dist,
                    "LATITUDE": lat,
                    "LONGITUDE": lon,
                    "FLAG": None,
                }
            )

    loc, attempts = _geocode_address(client)
    if loc:
        lat, lon = float(loc.latitude), float(loc.longitude)
        dist = _get_school_district_from_coords(lat, lon)
        return pd.Series(
            {
                "SCHOOL_DISTRICT": dist,
                "LATITUDE": lat,
                "LONGITUDE": lon,
                "FLAG": "district_from_shapefile" if attempts > 1 else None,
            }
        )

    district = "Unknown"
    if str(client.USER_ADDRESS_CITY).strip().lower() == "myrtle beach":
        logger.info(
            f"Manual fallback for Myrtle Beach: Setting school district to Horry County School District"
        )
        district = "Horry County School District"

    return pd.Series(
        {
            "SCHOOL_DISTRICT": district,
            "LATITUDE": None,
            "LONGITUDE": None,
            "FLAG": None,
        }
    )
