"""Permission checks matching hasPermission in src/lib/utils.ts."""

import json
from pathlib import Path

# Generated from PERMISSIONS in src/lib/constants.ts by
# src/lib/python-permissions.test.ts, which fails if the file is stale.
# Maps each permission to its heading ("<category>:<subgroup>:all") flag and, for a
# permission that moved groups, the heading flag it used to sit under.
_PERMISSIONS = json.loads((Path(__file__).parent / "permissions.json").read_text())


def has_permission(permissions: dict, permission: str) -> bool:
    """Whether a permissions object grants a permission.

    An explicit value for the permission wins; otherwise its heading's "all" flag
    decides, then the heading flag it used to sit under. The permission must be
    listed in permissions.json.
    """
    entry = _PERMISSIONS[permission]
    for key in (permission, entry["heading"], entry["legacy"]):
        value = permissions.get(key)
        if value is not None:
            return bool(value)
    return False


def effective_permissions(
    user_permissions: str | None, role_permissions: str | None
) -> dict:
    """A user's effective permissions from the stored JSON columns.

    Mirrors the session callback in src/server/auth/config.ts: the role's
    permissions with the user's own overrides layered on top.
    """
    role = json.loads(role_permissions) if role_permissions else {}
    user = json.loads(user_permissions) if user_permissions else {}
    return {**role, **user}


def login_permissions_allow_view(permissions: dict, login_id: int) -> bool:
    """Whether a user's permissions let them view one login.

    Mirrors canAccessLogin in src/lib/logins.ts for the global-permission-free
    case: edit and delete permission both include viewing.
    """
    return any(
        permissions.get(f"logins:{login_id}:{verb}") is True
        for verb in ("view", "edit", "delete")
    )
