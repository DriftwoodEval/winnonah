from geopy.location import Location

from utils.location import _is_confident_nominatim


class TestIsConfidentNominatim:
    def test_returns_false_for_none(self):
        assert _is_confident_nominatim(None) is False

    def test_returns_false_below_threshold(self):
        location = Location("123 Main St", (34.0, -80.0), {"importance": 0.39})
        assert _is_confident_nominatim(location) is False

    def test_returns_true_at_threshold(self):
        location = Location("123 Main St", (34.0, -80.0), {"importance": 0.4})
        assert _is_confident_nominatim(location) is True

    def test_returns_true_above_threshold(self):
        location = Location("123 Main St", (34.0, -80.0), {"importance": 0.9})
        assert _is_confident_nominatim(location) is True

    def test_treats_missing_importance_as_zero(self):
        location = Location("123 Main St", (34.0, -80.0), {})
        assert _is_confident_nominatim(location) is False
