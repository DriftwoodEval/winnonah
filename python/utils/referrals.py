import os
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pymupdf
from loguru import logger

import utils.database
import utils.google

LETTERHEAD_PATH = Path("letterhead.png")
IGNORE_SOURCES = {"unknown", "no referral source", "", "babynet"}


def format_name(name) -> str:
    """Cleans and title-cases referral source names."""
    exceptions = {"MUSC", "DDSN", "SC", "NC", "DSS", "MP", "LLC"}

    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"[^a-zA-Z\s]", " ", name)
    name = re.sub(r"\s{2,}", " ", name).strip()

    words = [
        word.upper() if word.upper() in exceptions else word.capitalize()
        for word in name.split()
    ]
    return " ".join(words)


def process_source_metadata(raw_source):
    """
    Standardizes a raw referral source string.
    Returns (cleaned_name, fax_digits, formatted_fax) or None if invalid.
    """
    if pd.isna(raw_source):
        return None

    source_str = str(raw_source).strip()
    if source_str.lower() in IGNORE_SOURCES:
        return None

    fax_digits = re.sub(r"\D", "", source_str)
    if len(fax_digits) != 10:
        return None

    cleaned_name = format_name(source_str)
    formatted_fax = f"({fax_digits[:3]}) {fax_digits[3:6]}-{fax_digits[6:]}"

    return {"name": cleaned_name, "fax": fax_digits, "fax_pretty": formatted_fax}


def generate_pdf(referral_name, client_group):
    """Creates a referral PDF."""
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
        f"Hi {referral_name},\n\nThank you for referring the following clients. "
        "We have received their information and have begun our process.",
        "\n".join([f"- {c['FULL_NAME']}" for c in client_group]),
        "Once the evaluation has been conducted, we will send their report. "
        "We currently estimate approximately a 6- to 9-month process.",
        "Thank you again!\nDriftwood Evaluation Center",
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


def create_and_send_referral_faxes(clients: pd.DataFrame):
    logger.debug("Starting referral fax process")

    last_date = utils.database.get_referral_fax_date() or (
        date.today() - timedelta(days=30)
    )

    cutoff_date = last_date + timedelta(days=1)

    clients = utils.database.get_all_clients()
    clients["ADDED_DATE_DT"] = pd.to_datetime(clients["ADDED_DATE"]).dt.date
    new_clients = clients[clients["ADDED_DATE_DT"] >= cutoff_date]

    if new_clients.empty:
        logger.info("No new clients to process.")
        return

    referral_groups = defaultdict(list)
    for _, client in new_clients.iterrows():
        source = str(client.get("REFERRAL_SOURCE", "")).strip()
        if source.lower() not in IGNORE_SOURCES:
            referral_groups[source].append(client)

    for raw_source, client_group in referral_groups.items():
        meta = process_source_metadata(raw_source)

        if not meta:
            logger.warning(f"Skipping invalid source: {raw_source}")
            continue

        pdf_content = generate_pdf(meta["name"], client_group)

        utils.google.send_gmail(
            message_text="Fax",
            subject="Fax",
            to_addr=f"{meta['fax']}@redfax.com",
            from_addr="me",
            attachments=[(pdf_content, f"{meta['name']}_{meta['fax']}.pdf")],
        )
        logger.info(f"Sent fax to {meta['name']}")

    utils.database.set_referral_fax_date(new_clients["ADDED_DATE_DT"].max())


def make_referral_fax_folders(clients: pd.DataFrame):
    """Make folders for referrals in the TO BE FAXED folder in Google Drive."""
    logger.debug("Making folders for referrals")
    fax_folder_id = os.getenv("FAX_FOLDER_ID")
    if not fax_folder_id:
        logger.error("FAX_FOLDER_ID is not set")
        return

    existing_items = utils.google.get_items_in_folder(fax_folder_id) or []
    existing_faxes = {re.sub(r"\D", "", f["name"]) for f in existing_items}

    raw_names = clients["REFERRAL_SOURCE"].dropna().unique()

    created_count = 0

    for raw_name in raw_names:
        meta = process_source_metadata(raw_name)

        if meta and meta["fax"] not in existing_faxes:
            folder_name = f"{meta['name']} {meta['fax']}"
            utils.google.create_folder_in_folder(folder_name, fax_folder_id)
            created_count += 1

    if created_count > 0:
        logger.info(f"Created {created_count} folders for referrals")
    else:
        logger.info("No new folders created for referrals")
