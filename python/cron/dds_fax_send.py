"""Faxes DDS records request replies that staff have approved.

Run as a module from python/:
    uv run python -m cron.dds_fax_send
"""

from dotenv import load_dotenv
from driftwood_common.log_format import json_log_format
from loguru import logger

from utils.config import validate_config
from utils.dds_fax import send_approved_dds_requests

# This process only runs the DDS send, so every record belongs in its log.
# (A name filter would miss the `__main__` records this script emits when run
# with `python -m`.)
logger.add("logs/dds-fax-send.log", format=json_log_format, rotation="50 MB")
load_dotenv()


def main() -> None:
    try:
        validate_config()
        send_approved_dds_requests()
    except Exception:
        logger.exception("Failed to run DDS fax send")


if __name__ == "__main__":
    main()
