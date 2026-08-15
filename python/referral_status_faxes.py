import argparse
import os
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pymupdf
import requests
from dateutil.relativedelta import relativedelta
from dotenv import load_dotenv
from loguru import logger

import utils.database
import utils.google
from utils.constants import TABLE_REFERRAL_STATUS_FAX_LOGS
from utils.misc import json_log_format
from utils.referrals import IGNORE_SOURCES, LETTERHEAD_PATH, process_source_metadata
from utils.timezone import now_business, utc_to_business

logger.add(
    "logs/referral-status-faxes.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "referral_status_faxes",
)
load_dotenv()

STATUS_FAX_INTERVAL = relativedelta(months=3)

# How far back to look for a client's most recent 3-month milestone when they
# have no fax log row yet. Matches the cron's own run cadence: a milestone
# crossed within the last week is still "due", one crossed longer ago means
# we missed that window and should wait for the next one instead of blasting
# a client who's been sitting past 3 months for a long time (e.g. everyone
# already in the pipeline the first time this cron runs).
MILESTONE_LOOKBACK = timedelta(days=7)


def months_elapsed(start: date, end: date) -> int:
    """Whole calendar months between two dates, floored."""
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return months


def most_recent_milestone(added_date: date, today: date) -> date | None:
    """The client's most recently completed 3-month-since-entry milestone
    (3 months out, 6 months out, etc.), or None if they aren't at 3 months
    yet."""
    periods = months_elapsed(added_date, today) // 3
    if periods < 1:
        return None
    return added_date + relativedelta(months=periods * 3)


def is_due(client: dict, today: date, cutoff: date, last_sent: date | None) -> bool:
    """A client with a fax log row is due once 3 months have passed since
    their last fax. One with no log row yet is due only if they crossed a
    3-month-since-entry milestone within the lookback window, so a client
    who passed that milestone long ago (with nothing ever logged) waits for
    their next milestone instead of being faxed immediately."""
    if last_sent is not None:
        return last_sent <= cutoff

    added_date = date.fromisoformat(client["addedDate"])
    milestone = most_recent_milestone(added_date, today)
    return milestone is not None and milestone > today - MILESTONE_LOOKBACK


def fetch_referral_statuses() -> list[dict]:
    """Pulls per-client referral status summaries from the Next.js app.

    See src/app/api/internal/referral-status/route.ts, which computes each
    active client's current DASHBOARD_CONFIG stage and maps it to
    referral-source-facing wording (src/lib/dashboard.ts:
    getReferralStatusSummary).
    """
    api_key = os.getenv("API_KEY")
    if not api_key:
        logger.error("API_KEY is not set, cannot fetch referral statuses")
        return []

    app_url = os.getenv("EMR_APP_URL", "https://emr.driftwoodeval.com")
    endpoint = f"{app_url.rstrip('/')}/api/internal/referral-status"
    response = requests.get(
        endpoint,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def get_last_sent_dates(client_ids: list[int]) -> dict[int, date]:
    """Returns each client's most recent status fax date (business-local), keyed by client id."""
    if not client_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(client_ids))
    with utils.database.get_db() as conn, conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT clientId, MAX(sentAt) AS lastSentAt
            FROM {TABLE_REFERRAL_STATUS_FAX_LOGS}
            WHERE clientId IN ({placeholders})
            GROUP BY clientId
            """,
            client_ids,
        )
        rows = cursor.fetchall()

    return {row["clientId"]: utc_to_business(row["lastSentAt"]).date() for row in rows}


def generate_status_pdf(referral_name: str, client_group: list[dict]) -> bytes:
    """Creates a referral status update PDF listing each client's current status."""
    doc = pymupdf.open()
    page = doc.new_page()
    width, height = page.rect.width, page.rect.height
    margin, current_y = 50, 50

    if Path.exists(LETTERHEAD_PATH):
        img_rect = pymupdf.Rect(margin, 20, width - margin, 120)
        page.insert_image(img_rect, filename=LETTERHEAD_PATH, keep_proportion=True)
        current_y = 140
    else:
        page.insert_text(
            (width / 2, current_y),
            "Driftwood Evaluation Center",
            fontsize=14,
            fontname="times-bold",
        )
        current_y += 40

    sections = [
        f"Hi {referral_name},\n\nHere is a status update on the client(s) you referred to us "
        "who are still in our evaluation process.",
        "\n".join(f"- {c['fullName']}: {c['statusText']}" for c in client_group),
        "Once the evaluation has been conducted, we will send their report. "
        "Thank you again for your referral!\nDriftwood Evaluation Center",
    ]

    for text in sections:
        rect = pymupdf.Rect(margin, current_y, width - margin, height - 100)
        unused = page.insert_textbox(rect, text, fontsize=12, fontname="times-roman")
        used_height = (rect.y1 - rect.y0) - max(unused, 0)
        current_y += used_height + 20

    footer_text = (
        "Confidentiality Statement: This transmission contains protected health information... "
        "(truncated for brevity)"
    )
    footer_rect = pymupdf.Rect(margin, height - 100, width - margin, height - 20)
    page.insert_textbox(footer_rect, footer_text, fontsize=8, fontname="times-italic")

    pdf_data = doc.tobytes()
    doc.close()
    return pdf_data


def log_faxes_sent(client_ids: list[int]) -> None:
    with utils.database.get_db() as conn, conn.cursor() as cursor:
        cursor.executemany(
            f"INSERT INTO {TABLE_REFERRAL_STATUS_FAX_LOGS} (clientId) VALUES (%s)",
            [(client_id,) for client_id in client_ids],
        )
        conn.commit()


def send_referral_status_faxes(dry_run: bool = False) -> None:
    """Faxes each referral source a status update for their clients who hit
    their 3-month-since-entry mark (or last status fax) this week and
    haven't finished the evaluation pipeline yet.

    With dry_run=True, still builds each referral source's PDF (written to
    temp/referral-status-faxes/ for inspection) but skips send_gmail and the
    dedup log, so it's safe to run against a real database.
    """
    logger.debug(f"Starting referral status fax process (dry_run={dry_run})")

    statuses = fetch_referral_statuses()
    if not statuses:
        logger.info("No referral statuses returned.")
        return

    today = now_business().date()
    cutoff = today - STATUS_FAX_INTERVAL

    candidates = [c for c in statuses if not c["done"]]
    if not candidates:
        logger.info("No non-done clients to consider.")
        return

    last_sent = get_last_sent_dates([c["clientId"] for c in candidates])
    due = [
        c for c in candidates if is_due(c, today, cutoff, last_sent.get(c["clientId"]))
    ]
    if not due:
        logger.info("No clients are due for a status fax this week.")
        return

    referral_groups: dict[str, list[dict]] = defaultdict(list)
    for client in due:
        source = str(client.get("referralSource", "")).strip()
        if source.lower() not in IGNORE_SOURCES:
            referral_groups[source].append(client)

    for raw_source, client_group in referral_groups.items():
        meta = process_source_metadata(raw_source)
        if not meta:
            logger.warning(f"Skipping invalid source: {raw_source}")
            continue

        pdf_content = generate_status_pdf(meta["name"], client_group)
        pdf_filename = f"{meta['name']}_{meta['fax']}_status.pdf"

        if dry_run:
            statuses = "; ".join(
                f"{c['fullName']}: {c['statusText']}" for c in client_group
            )
            out_dir = Path("temp/referral-status-faxes")
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / pdf_filename
            out_path.write_bytes(pdf_content)
            logger.info(
                f"[DRY RUN] Would fax {meta['name']} ({meta['fax_pretty']}) "
                f"for {len(client_group)} client(s): {statuses}. "
                f"PDF written to {out_path}"
            )
            continue

        utils.google.send_gmail(
            message_text="Fax",
            subject="Fax",
            to_addr=f"{meta['fax']}@redfax.com",
            from_addr="me",
            attachments=[(pdf_content, pdf_filename)],
        )
        logger.info(
            f"Sent status fax to {meta['name']} for {len(client_group)} client(s)"
        )

        log_faxes_sent([c["clientId"] for c in client_group])


def main():
    """Entry point for the referral status fax script."""
    parser = argparse.ArgumentParser(
        description="Fax referral sources a status update for clients still in the evaluation pipeline."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and log what would be faxed without sending or logging anything.",
    )
    args = parser.parse_args()

    try:
        send_referral_status_faxes(dry_run=args.dry_run)
    except Exception as e:
        logger.exception(f"Failed to run referral status faxes: {e}")


if __name__ == "__main__":
    main()
