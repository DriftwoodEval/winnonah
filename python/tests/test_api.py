import pytest

from api import col_num_to_letter


class TestColNumToLetter:
    @pytest.mark.parametrize(
        ("col_num", "expected"),
        [
            (0, "A"),
            (1, "B"),
            (25, "Z"),
            (26, "AA"),
            (27, "AB"),
            (51, "AZ"),
            (52, "BA"),
            (701, "ZZ"),
            (702, "AAA"),
        ],
    )
    def test_converts_zero_based_index_to_column_letter(self, col_num, expected):
        assert col_num_to_letter(col_num) == expected
