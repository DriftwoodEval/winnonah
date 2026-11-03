import pytest

from utils.permissions import (
    effective_permissions,
    has_permission,
    login_access_allows_view,
)


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


@pytest.mark.parametrize(
    ("access", "user_id", "role_id", "expected"),
    [
        (None, "u1", 1, False),
        ({}, "u1", 1, False),
        ({"view": {"userIds": ["u1"], "roleIds": []}}, "u1", None, True),
        ({"view": {"userIds": ["u2"], "roleIds": []}}, "u1", None, False),
        ({"view": {"userIds": [], "roleIds": [3]}}, "u1", 3, True),
        ({"view": {"userIds": [], "roleIds": [3]}}, "u1", None, False),
        ({"edit": {"userIds": ["u1"], "roleIds": []}}, "u1", None, True),
        ({"delete": {"userIds": [], "roleIds": [3]}}, "u1", 3, True),
    ],
)
def test_login_access_allows_view(access, user_id, role_id, expected):
    assert login_access_allows_view(access, user_id, role_id) is expected
