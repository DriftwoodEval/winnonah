# One-off scripts

Remediations, migrations, and debugging helpers that were run by hand against real data. They are not scheduled and are not part of the API or cron images' entry points.

Run them from `python/` as modules so `utils` resolves:

```
uv run python -m oneoff.remediate_noop_audit_log          # dry run
uv run python -m oneoff.remediate_noop_audit_log --apply
```

- `remediate_admin_review_rename.py`: rewrite stored permission IDs and list filter keys after the Insurance Review to Admin Review rename.
- `remediate_noop_audit_log.py`: delete or trim audit log entries whose diff recorded no real change.
- `remediate_wrong_session_resets.py`: restore clients who were wrongly given a fresh session when reactivated within 12 months.
- `migrate_drive.py`: copy Shared Drive files owned by an external user into the Shared Drive and replace shortcuts with the real files.
- `debug_orientation.py`: show how page rotation is decided for a Drive PDF, and optionally push a corrected file.

Each script's module docstring describes what it does and whether it defaults to a dry run.
