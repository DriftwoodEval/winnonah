"""Send a failover or failback notification email.

Invoked from the failover shell scripts on the host:

    docker exec winnonah-python python failover_notify.py failover
    docker exec winnonah-python python failover_notify.py failback

Recipients come from the ERROR_EMAILS env var (comma separated). Mail is sent
as tech@driftwoodeval.com via the Gmail API, matching the other automated mail
in this app.
"""

import os
import sys

from dotenv import load_dotenv
from loguru import logger

from utils.google import send_gmail
from utils.timezone import now_business

FROM_ADDR = "tech@driftwoodeval.com"

MESSAGES = {
    "failover": (
        "Primary server is down",
        "Automatic failover has completed. The standby host is now live and "
        "serving traffic at emr.driftwoodeval.com.",
    ),
    "failback": (
        "Failback complete",
        "Failback has completed. The primary host has been restored from the "
        "standby's data and is live again at emr.driftwoodeval.com. "
        "Replication (primary to standby) is re-established and the system is "
        "back to normal.",
    ),
}


def main() -> int:
    load_dotenv()

    if len(sys.argv) != 2 or sys.argv[1] not in MESSAGES:
        logger.error("Usage: failover_notify.py <failover|failback>")
        return 2

    event = sys.argv[1]
    subject, body = MESSAGES[event]

    recipients = [
        addr.strip()
        for addr in os.getenv("ERROR_EMAILS", "").split(",")
        if addr.strip()
    ]
    if not recipients:
        logger.error("ERROR_EMAILS is not set, cannot send notification.")
        return 1

    timestamp = now_business().strftime("%Y-%m-%d %H:%M:%S %Z")
    message_text = f"{body}\n\nTime: {timestamp}"

    send_gmail(
        message_text=message_text,
        subject=f"[Driftwood EMR] {subject}",
        to_addr=", ".join(recipients),
        from_addr=FROM_ADDR,
    )
    logger.info(f"Sent {event} notification to {recipients}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
