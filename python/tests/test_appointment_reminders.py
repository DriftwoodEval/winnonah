import json
from datetime import datetime, time, timedelta
from unittest.mock import patch

import pytest

from appointment_reminders import (
    _compute_age_years,
    _fix_stale_event_id,
    _matches_template,
    _office_fields,
    adjust_for_quiet_window,
    format_message,
    get_reminder_preview,
    is_confirmation,
    is_within_quiet_window,
)
from utils.timezone import now_business


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
        # startTime is naive-UTC; March 5 is EST (UTC-5), so 14:30 UTC is
        # 09:30 AM business-local.
        template = "See you $DATE at $START_TIME at $OFFICE_NAME, located $LOCATION."
        appointment = {
            "startTime": datetime(2026, 3, 5, 14, 30),
            "locationKey": "downtown",
            "officeLabel": "Downtown Office",
            "officeLocationPhrase": "at our Downtown office",
        }
        result = format_message(template, appointment)
        assert result == (
            "See you Thursday, March 05 at 09:30 AM at Downtown Office, "
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

    def test_age_range_filters_out_appointments_outside_range(self):
        template = make_template(triggerKeyword="Eval", minAgeYears=5, maxAgeYears=12)
        today = now_business().date()
        child = make_appt(
            calendarEventTitle="Eval visit",
            dob=today.replace(year=today.year - 8),
        )
        adult = make_appt(
            calendarEventTitle="Eval visit",
            dob=today.replace(year=today.year - 30),
        )
        assert _matches_template(child, template) is True
        assert _matches_template(adult, template) is False

    def test_age_range_missing_dob_does_not_match(self):
        template = make_template(triggerKeyword="Eval", minAgeYears=5)
        appt = make_appt(calendarEventTitle="Eval visit", dob=None)
        assert _matches_template(appt, template) is False

    def test_age_range_applies_to_follow_up_templates(self):
        today = now_business().date()
        no_reply_template = make_template(isNoReplyFollowUp=True, minAgeYears=18)
        confirmed_template = make_template(isConfirmedFollowUp=True, maxAgeYears=17)

        adult = make_appt(dob=today.replace(year=today.year - 30))
        child = make_appt(dob=today.replace(year=today.year - 10))

        assert _matches_template(adult, no_reply_template, has_prior_sent=True) is True
        assert _matches_template(child, no_reply_template, has_prior_sent=True) is False
        assert _matches_template(child, confirmed_template) is True
        assert _matches_template(adult, confirmed_template) is False


class TestComputeAgeYears:
    def test_computes_whole_years_before_birthday(self):
        today = now_business().date()
        dob = today.replace(year=today.year - 10) + timedelta(days=1)
        assert _compute_age_years(dob) == 9

    def test_computes_whole_years_after_birthday(self):
        today = now_business().date()
        dob = today.replace(year=today.year - 10) - timedelta(days=1)
        assert _compute_age_years(dob) == 10

    def test_none_dob_returns_none(self):
        assert _compute_age_years(None) is None


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


class FakeCursor:
    def __init__(self, results):
        self._results = list(results)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query, params=None):
        pass

    def fetchone(self):
        return self._results.pop(0) if self._results else None

    def fetchall(self):
        return self._results.pop(0) if self._results else []


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor


class TestIsWithinQuietWindow:
    def test_returns_true_when_current_time_is_inside_window(self):
        settings = {
            "quietWindowStart": timedelta(hours=0),
            "quietWindowEnd": timedelta(hours=23, minutes=59),
        }
        cursor = FakeCursor([settings])
        conn = FakeConnection(cursor)
        assert is_within_quiet_window(connection=conn) is True

    def test_returns_false_when_no_settings_row(self):
        cursor = FakeCursor([None])
        conn = FakeConnection(cursor)
        assert is_within_quiet_window(connection=conn) is False


class TestFixStaleEventId:
    def test_returns_found_event_on_success(self):
        context = {
            "appointment_id": "a1",
            "clientId": "c1",
            "startTime": datetime(2026, 3, 5, 9, 0),
        }
        found_event = {"id": "event-2"}
        with patch(
            "appointment_reminders.find_gcal_event_by_client_and_time",
            return_value=found_event,
        ):
            result = _fix_stale_event_id(context, "stale-event-1")
        assert result == found_event

    def test_returns_none_when_no_event_found(self):
        context = {
            "appointment_id": "a1",
            "clientId": "c1",
            "startTime": datetime(2026, 3, 5, 9, 0),
        }
        with patch(
            "appointment_reminders.find_gcal_event_by_client_and_time",
            return_value=None,
        ):
            result = _fix_stale_event_id(context, "stale-event-1")
        assert result is None


def make_reminder_appt(**overrides):
    base = {
        "id": "appt-1",
        # Far enough in the future that reminders aren't seen as overdue-and-past
        # regardless of when the test suite runs.
        "startTime": datetime.now() + timedelta(days=30),
        "daEval": None,
        "locationKey": "downtown",
        "calendarEventTitle": "",
        "cancelled": 0,
        "rescheduled": 0,
        "placeholder": 0,
        "doNotRemind": 0,
        "billingOnly": 0,
        "confirmedAt": None,
        "language": "English",
        "phoneNumber": "8435551234",
        "officeLabel": "Downtown Office",
        "officeLocationPhrase": "at our Downtown office",
    }
    base.update(overrides)
    return base


class TestGetReminderPreview:
    def test_returns_none_when_appointment_not_found(self):
        cursor = FakeCursor([None, None])
        conn = FakeConnection(cursor)
        assert get_reminder_preview("missing-id", connection=conn) is None

    def test_suppressed_when_cancelled(self):
        appt = make_reminder_appt(cancelled=1)
        cursor = FakeCursor([None, appt, [], []])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["suppressed"] is True
        assert result["suppressedReason"] == "cancelled"
        assert result["pending"] == []

    def test_suppressed_reason_priority_order(self):
        appt = make_reminder_appt(cancelled=0, rescheduled=1, placeholder=1)
        cursor = FakeCursor([None, appt, [], []])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["suppressedReason"] == "rescheduled"

    def test_not_suppressed_includes_pending_templates(self):
        appt = make_reminder_appt(locationKey="downtown")
        template = {
            "id": 1,
            "name": "24 hour reminder",
            "sendOffsetHours": 24,
            "isNoReplyFollowUp": False,
            "isConfirmedFollowUp": False,
            "triggerLocationKey": json.dumps(["downtown"]),
            "triggerKeyword": None,
            "triggerDaEval": None,
            "messageTemplate": "See you soon",
        }
        cursor = FakeCursor([None, appt, [template], []])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["suppressed"] is False
        assert len(result["pending"]) == 1
        assert result["pending"][0]["templateName"] == "24 hour reminder"

    def test_already_sent_template_excluded_from_pending(self):
        appt = make_reminder_appt()
        template = {
            "id": 1,
            "name": "24 hour reminder",
            "sendOffsetHours": 24,
            "isNoReplyFollowUp": False,
            "isConfirmedFollowUp": False,
            "triggerLocationKey": None,
            "triggerKeyword": None,
            "triggerDaEval": None,
            "messageTemplate": "See you soon",
        }
        sent_log = {
            "sentAt": datetime(2026, 3, 4, 14, 0),
            "reminderTemplateId": 1,
            "templateName": "24 hour reminder",
            "messageTemplate": "See you soon",
        }
        cursor = FakeCursor([None, appt, [template], [sent_log]])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["pending"] == []
        assert len(result["sent"]) == 1
        assert result["sent"][0]["templateName"] == "24 hour reminder"

    def test_virtual_location_uses_special_cased_office_fields(self):
        appt = make_reminder_appt(locationKey="Virtual")
        cursor = FakeCursor([None, appt, [], []])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["officeName"] == "Virtual"
        assert result["officeLocationPhrase"] == "virtually"

    def test_has_phone_reflects_presence_of_phone_number(self):
        appt = make_reminder_appt(phoneNumber=None)
        cursor = FakeCursor([None, appt, [], []])
        conn = FakeConnection(cursor)
        result = get_reminder_preview("appt-1", connection=conn)
        assert result["hasPhone"] is False
