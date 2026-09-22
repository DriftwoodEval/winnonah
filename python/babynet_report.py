import pandas as pd
from dotenv import load_dotenv
from loguru import logger

from utils.constants import TABLE_BABYNET_REPORT
from utils.database import get_db
from utils.misc import json_log_format
from utils.therapyappointment import INPUT_DIR
from utils.timezone import now_business

logger.add(
    "logs/babynet-report.log",
    format=json_log_format,
    rotation="50 MB",
    filter=lambda r: r["name"] == "babynet_report",
)
load_dotenv()

PER_CLIENT_AMOUNT = 1021.32


def compute_babynet_client_count() -> int:
    """Counts distinct BabyNet clients from the billing CSV export."""
    billing_csv = INPUT_DIR / "clients-billing.csv"
    df = pd.read_csv(billing_csv)

    babynet_rows = df[df["Insurance"].str.contains("babynet", case=False, na=False)]
    return babynet_rows["Client"].nunique()


def save_babynet_report(client_count: int) -> None:
    """Saves this week's BabyNet client count and dollar amount to the database."""
    week_of = now_business().date().isoformat()
    amount = round(client_count * PER_CLIENT_AMOUNT, 2)

    sql = f"""
        INSERT INTO {TABLE_BABYNET_REPORT} (weekOf, clientCount, amount)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE clientCount = VALUES(clientCount), amount = VALUES(amount)
    """
    with get_db() as conn, conn.cursor() as cursor:
        cursor.execute(sql, (week_of, client_count, amount))
        conn.commit()

    logger.info(
        f"Saved BabyNet report for {week_of}: {client_count} clients, ${amount}"
    )


def main():
    try:
        client_count = compute_babynet_client_count()
        save_babynet_report(client_count)
    except Exception as e:
        logger.exception(f"Failed to generate BabyNet report: {e}")


if __name__ == "__main__":
    main()
