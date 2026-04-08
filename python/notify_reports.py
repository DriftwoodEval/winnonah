import os

from dotenv import load_dotenv
from loguru import logger

from utils.config import validate_config
from utils.constants import TABLE_SEEN_REPORT_FOLDERS
from utils.database import get_db, get_queue_notify_users
from utils.google import get_items_in_folder, send_gmail

logger.add("logs/report-notifications.log", rotation="50 MB")
load_dotenv()


def check_report_queue_and_notify():
    """Checks the Report Queue for new folders and notifies eligible users."""
    source_id = "1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s"

    logger.info(f"Checking report queue: {source_id}")

    items = get_items_in_folder(source_id)
    if not items:
        logger.info("No folders found in report queue.")
        return

    new_folders = []
    with get_db() as conn:
        with conn.cursor() as cursor:
            for item in items:
                folder_id = item["id"]
                folder_name = item["name"]

                # Check if we've already notified for this folder
                cursor.execute(
                    f"SELECT folderId FROM {TABLE_SEEN_REPORT_FOLDERS} WHERE folderId = %s",
                    (folder_id,),
                )
                if not cursor.fetchone():
                    new_folders.append(item)

    if not new_folders:
        logger.info("No new folders in report queue.")
        return

    logger.info(f"Found {len(new_folders)} new folders. Notifying users...")

    # Find users with reports:notifications permission who don't have a claimed folder
    eligible_users = get_queue_notify_users()
    if not eligible_users:
        logger.warning("No eligible users found to notify.")
        return

    for folder in new_folders:
        folder_name = folder["name"]
        folder_url = folder.get(
            "webViewLink", f"https://drive.google.com/drive/folders/{folder['id']}"
        )

        subject = f"New Report Folder in Queue: {folder_name}"
        message_text = f"A new report folder has been added to the queue: {folder_name}\n\nYou can claim it on the site: https://emr.driftwoodeval.com/claim-reports"

        html_content = f"""
        <p>A new report folder has been added to the queue: <strong>{folder_name}</strong></p>
        <p>You can claim it in the app: <a href="https://emr.driftwoodeval.com/claim-reports">Claim Reports</a></p>
        """

        for user in eligible_users:
            logger.info(f"Notifying {user['email']} about folder {folder_name}")
            send_gmail(
                message_text=message_text,
                subject=subject,
                to_addr=user["email"],
                from_addr="tech@driftwoodeval.com",
                html=html_content,
            )

        # Mark as seen
        with get_db() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"INSERT INTO {TABLE_SEEN_REPORT_FOLDERS} (folderId) VALUES (%s)",
                    (folder["id"],),
                )
                conn.commit()


def main():
    """Entry point for the report notifications script."""
    try:
        validate_config()
        check_report_queue_and_notify()
    except Exception as e:
        logger.exception(f"Failed to run report notifications: {e}")


if __name__ == "__main__":
    main()
