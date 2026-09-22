"""Permission checks matching hasPermission in src/lib/utils.ts."""

# The heading ("<category>:<subgroup>:all") flag that covers each permission checked
# on the Python side, mirroring PERMISSIONS in src/lib/constants.ts.
# src/lib/python-permissions.test.ts fails if an entry here disagrees with it.
PERMISSION_GROUPS = {
    "clients:admin:review": "clients:insurance:all",
    "clients:admin:review:email-notifications": "clients:insurance:all",
    "clients:download": "clients:admin:all",
    "clients:pa-forms": "clients:insurance:all",
    "reports:approve": "clients:admin:all",
    "reports:notifications": "clients:admin:all",
    "settings:evaluators": "system:settings:all",
    "settings:impersonate": "system:settings:all",
    "settings:qsuite:services": "system:qsuite:all",
    "settings:qsuite:services:view": "system:qsuite:all",
}


def has_permission(permissions: dict, permission: str) -> bool:
    """Whether a permissions object grants a permission.

    An explicit value for the permission wins; otherwise its heading's "all" flag
    decides. The permission must be listed in PERMISSION_GROUPS.
    """
    value = permissions.get(permission)
    if value is None:
        value = permissions.get(PERMISSION_GROUPS[permission])
    return bool(value)
