from datetime import date, datetime

import fitz
import pytest
from dateutil.relativedelta import relativedelta

from utils.forms import fill_select_health_form


def get_field_values(pdf_bytes: bytes) -> dict[str, str | bool]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    values = {}
    for page in doc:
        for widget in page.widgets():
            if not isinstance(widget, fitz.Widget):
                continue
            if widget.field_type_string == "CheckBox":
                values[widget.field_name] = widget.field_value == widget.on_state()
            else:
                values[widget.field_name] = widget.field_value
    doc.close()
    return values


class TestFillSelectHealthForm:
    def test_fills_basic_patient_fields(self):
        client_data = {
            "fullName": "Jane Doe",
            "dob": date(2015, 6, 1),
            "referralSource": "Dr. Smith",
            "insuranceNumber": "1234567890",
        }
        values = get_field_values(fill_select_health_form(client_data))

        assert values["Patient name 2"] == "Jane Doe"
        assert values["DOB"] == "06/01/2015"
        assert values["Referral Source"] == "Dr. Smith"
        assert values["Medicaid ID/SS #/Patient ID: "] == "1234567890"

    def test_accepts_datetime_dob(self):
        client_data = {"dob": datetime(2015, 6, 1, 8, 30)}
        values = get_field_values(fill_select_health_form(client_data))
        assert values["DOB"] == "06/01/2015"

    def test_missing_fields_are_left_blank(self):
        values = get_field_values(fill_select_health_form({}))
        assert values["Patient name 2"] == ""
        assert values["DOB"] == ""
        assert values["Age"] == ""
        assert values["Referral Source"] == ""
        assert values["Medicaid ID/SS #/Patient ID: "] == ""

    @pytest.mark.parametrize(
        ("age_years", "expect_yes"),
        [(11, False), (12, True), (25, True)],
    )
    def test_substance_abuse_checkbox_reflects_age_cutoff(self, age_years, expect_yes):
        dob = date.today() - relativedelta(years=age_years)
        values = get_field_values(fill_select_health_form({"dob": dob}))

        assert values["Age"] == str(age_years)
        assert values["Check Box 142"] is expect_yes
        assert values["Check Box 143"] is not expect_yes

    def test_no_dob_defaults_to_substance_abuse_no(self):
        # age_years is None without a dob, so the "12+" check fails open to "No".
        values = get_field_values(fill_select_health_form({}))
        assert values["Check Box 142"] is False
        assert values["Check Box 143"] is True

    def test_fills_cpt_rows_with_todays_date_range(self):
        cpt_codes = [{"code": "96130", "units": 4}]
        values = get_field_values(fill_select_health_form({}, cpt_codes=cpt_codes))

        today_str = date.today().strftime("%m/%d/%Y")
        stop_str = (date.today() + relativedelta(months=12)).strftime("%m/%d/%Y")

        assert values["Start date 4.5"] == today_str
        assert values["Stop date"] == stop_str
        assert values["CPT code"] == "96130"
        assert values["Units requested"] == "4"

    def test_fills_multiple_cpt_rows_in_order(self):
        cpt_codes = [
            {"code": "96130", "units": 4},
            {"code": "96131", "units": 2},
        ]
        values = get_field_values(fill_select_health_form({}, cpt_codes=cpt_codes))

        assert values["CPT code"] == "96130"
        assert values["Units requested"] == "4"
        assert values["CPT code 1"] == "96131"
        assert values["Units requested 1"] == "2"

    def test_extra_cpt_codes_beyond_five_rows_are_ignored(self):
        # Only 5 CPT row slots exist on the form; entries past that have
        # nowhere to go and should be dropped rather than raising.
        cpt_codes = [{"code": f"9613{i}", "units": i} for i in range(7)]
        values = get_field_values(fill_select_health_form({}, cpt_codes=cpt_codes))

        assert values["CPT code 4"] == "96134"

    def test_no_cpt_codes_leaves_cpt_rows_blank(self):
        values = get_field_values(fill_select_health_form({}))
        assert values["CPT code"] == ""
        assert values["Start date 4.5"] == ""
        assert values["Stop date"] == ""
        assert values["Units requested"] == ""

    def test_returns_pdf_bytes(self):
        result = fill_select_health_form({})
        assert isinstance(result, bytes)
        assert result.startswith(b"%PDF")
