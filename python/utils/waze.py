"""Shared helper for querying live by-car drive time and distance via Waze.

Used both for the on-demand drive-times lookup in api.py and for the
office_drive_times.py batch job that backfills emr_office_drive_time.
"""

from pywaze import route_calculator

KM_PER_MILE = 1.60934


async def get_drive_time(start: str, end: str) -> route_calculator.CalcRoutesResponse:
    """Returns the fastest by-car route between two "lat, lon" points, via Waze."""
    async with route_calculator.WazeRouteCalculator(region="US") as waze:
        routes = await waze.calc_routes(start, end)
        return routes[0]
