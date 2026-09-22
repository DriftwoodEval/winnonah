import pytest

from utils.permissions import has_permission


@pytest.mark.parametrize(
    ("permissions", "expected"),
    [
        ({}, False),
        ({"reports:approve": True}, True),
        ({"reports:approve": False}, False),
        ({"clients:admin:all": True}, True),
        ({"clients:admin:all": True, "reports:approve": False}, False),
        ({"clients:admin:all": False, "reports:approve": True}, True),
        ({"system:settings:all": True}, False),
    ],
)
def test_has_permission(permissions, expected):
    assert has_permission(permissions, "reports:approve") is expected


def test_has_permission_rejects_unmapped_permission():
    with pytest.raises(KeyError):
        has_permission({}, "clients:not-mapped")
