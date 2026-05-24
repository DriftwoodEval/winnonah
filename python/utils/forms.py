from datetime import date, datetime
from pathlib import Path

import fitz  # pymupdf
from dateutil.relativedelta import relativedelta

FORM_PATH = Path(__file__).parent.parent / "forms" / "shsc-bh-testing-form.pdf"

# Page 2 CPT service row, first row only for now
# The first row uses "Start date 4.5" / "Stop date"
CPT_START_FIELDS = ["Start date 4.5"]
CPT_STOP_FIELDS = ["Stop date"]


def fill_select_health_form(client_data: dict) -> bytes:
    """Fills the SHSC Select Health behavioral health testing authorization form.

    Autofills: patient name, DOB, age, referral source, Medicaid/insurance ID,
    substance abuse assessment checkbox (Yes if age >= 12, No if younger), and
    CPT service date range (today → today + 12 months).

    Args:
        client_data: Dict with keys: fullName, dob (date/datetime), referralSource,
                     insuranceNumber.

    Returns:
        Filled PDF as bytes.
    """
    doc = fitz.open(FORM_PATH)

    today = date.today()
    stop = today + relativedelta(months=12)
    today_str = today.strftime("%m/%d/%Y")
    stop_str = stop.strftime("%m/%d/%Y")

    dob = client_data.get("dob")
    if isinstance(dob, datetime):
        dob = dob.date()

    age_years: int | None = None
    dob_str = ""
    if dob:
        age_years = relativedelta(today, dob).years
        dob_str = dob.strftime("%m/%d/%Y")

    # Substance abuse assessment: Yes if 12 or older, No if younger.
    substance_abuse_yes = age_years is not None and age_years >= 12
    substance_abuse_no = not substance_abuse_yes

    field_map: dict[str, str | bool] = {
        "Patient name 2": client_data.get("fullName") or "",
        "DOB": dob_str,
        "Age": str(age_years) if age_years is not None else "",
        "Referral Source": client_data.get("referralSource") or "",
        # Note: field name has a trailing space — must match exactly
        "Medicaid ID/SS #/Patient ID: ": client_data.get("insuranceNumber") or "",
        "Check Box 142": substance_abuse_yes,
        "Check Box 143": substance_abuse_no,
        **dict.fromkeys(CPT_START_FIELDS, today_str),
        **dict.fromkeys(CPT_STOP_FIELDS, stop_str),
    }

    for page in doc:
        for widget in page.widgets():
            if not isinstance(widget, fitz.Widget):
                continue
            if widget.field_name not in field_map:
                continue
            val = field_map[widget.field_name]
            if widget.field_type_string == "CheckBox":
                widget.field_value = widget.on_state() if val else "Off"  # type: ignore[assignment]
            else:
                widget.field_value = val  # type: ignore[assignment]
            widget.update()

    pdf_bytes = doc.tobytes(deflate=True)
    doc.close()
    return pdf_bytes
