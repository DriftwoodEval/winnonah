# One-off scripts

Migrations, backfills, imports, and cleanups that were run once against real data. They are kept for reference and as starting points, not run on a schedule.

Run TypeScript scripts from the repo root, for example `pnpm exec tsx scripts/oneoff/<name>.ts`. Data files a script reads (such as `notes.json` or `schools.xlsx`) are gitignored and expected next to the script.

- `backfill-appointment-utc.md`: convert appointment times to true UTC (SQL in Markdown).
- `backfill-user-preferences.md`: move per-user home widgets, header items, and issue list order into `emr_user.preferences` and drop the old columns (SQL in Markdown).
- `backfill-reports.ts`: populate `emr_report` from the punch list.
- `cleanup-backfilled-reports.ts`: delete stale report rows the backfill created.
- `cleanup-no-link-grabbed-failures.ts`: clean up "no link grabbed" failure records.
- `calculate-office-move-impact.ts`: estimate the effect of moving an office to new coordinates (`<officeKey> <newLat> <newLon>`).
- `find-unparsable-precert-memos.ts`: list precert memos the parser cannot read.
- `import-note-titles.ts`, `import-private-schools.ts`, `import-school-districts.ts`: bulk imports from exported files.
- `migrate-asana-notes.ts`, `migrate-punchlist-records.ts`: migrations from Asana and the punch list.
- `rename-charter-school-fields.ts`, `rename-columns-to-camelcase.sql`: terminology and column renames.

Seed scripts that fill reference tables live in `scripts/seed/`. Python one-offs live in `python/oneoff/`.
