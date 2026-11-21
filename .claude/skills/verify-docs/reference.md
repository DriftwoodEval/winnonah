# Shared docs reference

Used by `verify-docs` and `write-docs`.

## Source of truth

Docs pages don't point back to the code they describe, so reconstruct it. A page usually lives in one of three code surfaces:

- **Web app** (UI labels, dashboards, screens, permissions, business rules enforced on click): `winnonah/src/**`. Routers are in `src/server/api/routers/`, the schema in `src/server/db/schema.ts`.
- **Python sidecar and cron** (background syncs, scheduled jobs, fax/document processing, reminders, internal reports): `winnonah/python/`. See the layout in the root `CLAUDE.md`. Extras:
  - `api/app.py` also starts the in-process `appointment_reminders.reminder_cron()` loop.
  - `cron/main.py` is the Typer CLI behind the recurring TherapyAppointment sync, fax, and referral work. Other jobs in `cron/` run on their own cron.
  - Cadences come from the deployment's crontab/compose, not the script source. Treat a stated schedule as suspected drift unless the doc itself is the source of truth for it.
- **questionnaires repo** (questionnaire send/receive, records requests, piecework/billing exports): root scripts `qsend.py`, `qreceive.py`, `records-request.py`, `piecework.py`, `log-server.py` and `questionnaires/utils/`.

The two Python surfaces share config through the `py-config` tRPC router (`src/server/api/routers/admin/py-config.ts`) and timezone helpers through `driftwood-common`. A rule quoted in a doc may be defined in TS and consumed in Python, so check both.

Pull every bolded UI label, button/field name, permission string, dashboard section name, cron cadence, and script filename from the page, then grep the exact strings across the surface. A page about one script or one router usually resolves to a few files: read them in full instead of trusting grep snippets.

## Reader test

A page can be accurate and still leave a non-technical staff member stuck.

1. Write 5 to 10 questions a staff member would realistically bring to the page ("how do I know it worked?", "what if the client isn't in the list?", "who is allowed to do this?").
2. Spawn a subagent (`Explore` is fine) given only the page text, no repo, no context. Ask it those questions, plus "what here assumes knowledge you don't have?" and "anything ambiguous or contradictory?".
3. Where the reader can't answer, answers wrong, or has to guess, record a gap (or fix the page, when drafting).

For `development/` pages, tell the subagent to answer as a software engineer new to the codebase.

## Audience

Docs are for non-technical staff. Exceptions:

- `development/` pages are for engineers. Technical vocabulary is fine.
- Elsewhere, a technical aside is fine if fenced off: its own heading (`## Technical detail`, `## For developers`) or a callout (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`). Technical detail mixed into main steps or the opening paragraph is a problem.
