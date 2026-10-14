from dotenv import load_dotenv
from driftwood_common.log_format import json_log_format
from loguru import logger

from api.appointment_reminders import is_within_quiet_window
from utils.therapyappointment import send_queued_post_visit_messages

logger.add(
    "logs/post-visit-messages.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "utils.therapyappointment",
)
load_dotenv()

if __name__ == "__main__":
    # Same quiet hours as appointment reminders (Settings > Reminders).
    if is_within_quiet_window():
        logger.info("Within quiet window, skipping post-visit messages.")
    else:
        send_queued_post_visit_messages()
