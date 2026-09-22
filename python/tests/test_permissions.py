import pytest

from utils.permissions import effective_permissions, has_permission


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


@pytest.mark.parametrize(
    ("user_permissions", "role_permissions", "expected"),
    [
        (None, None, {}),
        ('{"reports:approve": true}', None, {"reports:approve": True}),
        (None, '{"clients:admin:all": true}', {"clients:admin:all": True}),
        (
            '{"reports:notifications": false}',
            '{"reports:notifications": true, "reports:approve": true}',
            {"reports:notifications": False, "reports:approve": True},
        ),
    ],
)
def test_effective_permissions(user_permissions, role_permissions, expected):
    assert effective_permissions(user_permissions, role_permissions) == expected
