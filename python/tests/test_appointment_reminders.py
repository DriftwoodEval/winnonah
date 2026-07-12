import json
from datetime import datetime, time, timedelta

import pytest

from appointment_reminders import (
    _matches_template,
    _office_fields,
    adjust_for_quiet_window,
    format_message,
    is_confirmation,
)


class TestOfficeFields:
    def test_virtual_location_is_special_cased(self):
        appt = {
            "locationKey": "Virtual",
            "officeLabel": "Should be ignored",
            "officeLocationPhrase": "Should be ignored",
        }
        assert _office_fields(appt) == ("Virtual", "virtually")

    def test_physical_location_passes_through(self):
        appt = {
            "locationKey": "downtown",
            "officeLabel": "Downtown Office",
            "officeLocationPhrase": "at our Downtown office",
        }
        assert _office_fields(appt) == ("Downtown Office", "at our Downtown office")


class TestFormatMessage:
    def test_substitutes_all_placeholders(self):
        template = "See you $DATE at $START_TIME at $OFFICE_NAME, located $LOCATION."
        appointment = {
            "startTime": datetime(2026, 3, 5, 14, 30),
            "locationKey": "downtown",
            "officeLabel": "Downtown Office",
            "officeLocationPhrase": "at our Downtown office",
        }
        result = format_message(template, appointment)
        assert result == (
            "See you Thursday, March 05 at 02:30 PM at Downtown Office, "
            "located at our Downtown office."
        )

    def test_missing_office_fields_become_empty_string(self):
        template = "$OFFICE_NAME / $LOCATION"
        appointment = {
            "startTime": datetime(2026, 3, 5, 14, 30),
            "locationKey": None,
            "officeLabel": None,
            "officeLocationPhrase": None,
        }
        assert format_message(template, appointment) == " / "

    def test_virtual_appointment_uses_special_cased_fields(self):
        template = "$OFFICE_NAME, $LOCATION"
        appointment = {
            "startTime": datetime(2026, 3, 5, 14, 30),
            "locationKey": "Virtual",
        }
        assert format_message(template, appointment) == "Virtual, virtually"


class TestAdjustForQuietWindow:
    def test_no_settings_returns_unchanged(self):
        dt = datetime(2026, 3, 5, 3, 0)
        assert adjust_for_quiet_window(dt, None) == (dt, False)

    def test_missing_start_or_end_returns_unchanged(self):
        dt = datetime(2026, 3, 5, 3, 0)
        settings = {"quietWindowStart": None, "quietWindowEnd": None}
        assert adjust_for_quiet_window(dt, settings) == (dt, False)

    def test_outside_window_returns_unchanged(self):
        # Window is 22:00-08:00 overnight; 14:00 is outside it.
        dt = datetime(2026, 3, 5, 14, 0)
        settings = {
            "quietWindowStart": timedelta(hours=22),
            "quietWindowEnd": timedelta(hours=8),
        }
        assert adjust_for_quiet_window(dt, settings) == (dt, False)

    def test_inside_overnight_window_after_midnight_pushes_to_window_end(self):
        # 3 AM falls within the 22:00-08:00 overnight window and is already
        # "after" the start, so it should be pushed to 08:00 the same day.
        dt = datetime(2026, 3, 5, 3, 0)
        settings = {
            "quietWindowStart": timedelta(hours=22),
            "quietWindowEnd": timedelta(hours=8),
        }
        result, adjusted = adjust_for_quiet_window(dt, settings)
        assert adjusted is True
        assert result == datetime(2026, 3, 5, 8, 0)

    def test_inside_overnight_window_before_midnight_pushes_to_next_day(self):
        # 11 PM falls within the 22:00-08:00 overnight window on the "before
        # midnight" side, so the adjusted time rolls into the next day.
        dt = datetime(2026, 3, 5, 23, 0)
        settings = {
            "quietWindowStart": timedelta(hours=22),
            "quietWindowEnd": timedelta(hours=8),
        }
        result, adjusted = adjust_for_quiet_window(dt, settings)
        assert adjusted is True
        assert result == datetime(2026, 3, 6, 8, 0)

    def test_inside_standard_same_day_window(self):
        dt = datetime(2026, 3, 5, 12, 0)
        settings = {
            "quietWindowStart": timedelta(hours=9),
            "quietWindowEnd": timedelta(hours=17),
        }
        result, adjusted = adjust_for_quiet_window(dt, settings)
        assert adjusted is True
        assert result == datetime(2026, 3, 5, 17, 0)

    def test_accepts_time_objects_directly(self):
        dt = datetime(2026, 3, 5, 3, 0)
        settings = {
            "quietWindowStart": time(22, 0),
            "quietWindowEnd": time(8, 0),
        }
        result, adjusted = adjust_for_quiet_window(dt, settings)
        assert adjusted is True
        assert result == datetime(2026, 3, 5, 8, 0)


def make_appt(**overrides):
    base = {
        "confirmedAt": None,
        "calendarEventTitle": "",
        "locationKey": None,
        "daEval": None,
    }
    base.update(overrides)
    return base


def make_template(**overrides):
    base = {
        "isNoReplyFollowUp": False,
        "isConfirmedFollowUp": False,
        "triggerLocationKey": None,
        "triggerKeyword": None,
        "triggerDaEval": None,
    }
    base.update(overrides)
    return base


class TestMatchesTemplate:
    def test_no_reply_follow_up_requires_prior_send_and_unconfirmed(self):
        template = make_template(isNoReplyFollowUp=True)
        appt = make_appt()
        assert _matches_template(appt, template, has_prior_sent=True) is True
        assert _matches_template(appt, template, has_prior_sent=False) is False

    def test_no_reply_follow_up_false_if_confirmed(self):
        template = make_template(isNoReplyFollowUp=True)
        appt = make_appt(confirmedAt=datetime(2026, 3, 5))
        assert _matches_template(appt, template, has_prior_sent=True) is False

    def test_confirmed_follow_up_always_matches(self):
        template = make_template(isConfirmedFollowUp=True)
        assert _matches_template(make_appt(), template) is True
        assert (
            _matches_template(make_appt(confirmedAt=datetime(2026, 3, 5)), template)
            is True
        )

    def test_standard_template_excludes_confirmed_appointments(self):
        template = make_template(triggerKeyword="Eval")
        appt = make_appt(
            confirmedAt=datetime(2026, 3, 5), calendarEventTitle="Eval visit"
        )
        assert _matches_template(appt, template) is False

    def test_standard_template_matches_on_keyword(self):
        template = make_template(triggerKeyword="Eval")
        assert (
            _matches_template(make_appt(calendarEventTitle="Eval visit"), template)
            is True
        )
        assert (
            _matches_template(make_appt(calendarEventTitle="Follow-up"), template)
            is False
        )

    def test_standard_template_matches_on_location_key(self):
        template = make_template(triggerLocationKey=json.dumps(["downtown", "west"]))
        assert _matches_template(make_appt(locationKey="downtown"), template) is True
        assert _matches_template(make_appt(locationKey="east"), template) is False

    def test_standard_template_matches_on_da_eval(self):
        template = make_template(triggerDaEval=True)
        assert _matches_template(make_appt(daEval=True), template) is True
        assert _matches_template(make_appt(daEval=False), template) is False

    def test_standard_template_requires_both_location_and_da_eval_when_both_set(self):
        template = make_template(
            triggerLocationKey=json.dumps(["downtown"]), triggerDaEval=True
        )
        assert (
            _matches_template(make_appt(locationKey="downtown", daEval=True), template)
            is True
        )
        assert (
            _matches_template(make_appt(locationKey="downtown", daEval=False), template)
            is False
        )

    def test_standard_template_with_no_criteria_matches_nothing(self):
        template = make_template()
        assert _matches_template(make_appt(), template) is False


class TestIsConfirmation:
    @pytest.mark.parametrize(
        "text",
        ["yes", "Yes!", "YEAH", "confirm", "Confirmed, thanks", "y"],
    )
    def test_recognizes_confirmation_keywords(self, text):
        assert is_confirmation(text) is True

    @pytest.mark.parametrize(
        "text",
        ["👍", "✅", "Sounds good 👍🏽"],
    )
    def test_recognizes_confirmation_emoji(self, text):
        assert is_confirmation(text) is True

    def test_word_boundary_prevents_false_positive_substring_match(self):
        # "yesterday" contains "yes" but should not count as a confirmation.
        assert is_confirmation("can we do it yesterday instead") is False

    @pytest.mark.parametrize(
        "text",
        ["no", "can we reschedule?", "not sure yet", ""],
    )
    def test_rejects_non_confirmation_text(self, text):
        assert is_confirmation(text) is False
