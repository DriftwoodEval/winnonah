---
name: verify-docs
description: Audits one or more docs pages under src/content/docs against the actual source code they describe, reporting where the prose has drifted (renamed labels, changed permissions, removed features, changed business rules) and where it leaves a non-technical reader stuck (coverage and clarity gaps). Use when the user asks to verify, audit, or check a docs page for accuracy, or periodically to sanity-check the docs site. Read-only, does not edit files. Takes an optional argument naming a page by its path or slug under src/content/docs (e.g. "<section>/<page>"); without one, audits every page.
---

# Verify Docs

This is a periodic, human-triggered accuracy audit for the docs site at `src/content/docs/`. It exists because `scripts/validate-docs.ts` (run via `mise run check:docs`) only catches structural rot, broken links, missing images, malformed frontmatter, not whether the prose still matches what the code actually does. That's a judgment call an LLM has to make by re-reading the doc next to its source, this skill is that process.

Never auto-edit a doc as part of this skill. Report findings; let a human (or a follow-up request) decide what to change.

The docs audience is non-technical staff operating the app. "Drift" means the page describes something the user does or sees that the code no longer matches, a renamed button, a changed rule, a removed step. An internal rename that never surfaces to the user is not drift. Don't flag prose for being too plain.

Two exceptions to the non-technical framing:
- Pages under `development/` are for software engineers. Judge them on accuracy the same way, but don't file clarity gaps for assuming engineering knowledge, that's the intended audience.
- Elsewhere, a technical aside is fine when it's clearly fenced off from the main flow: its own heading (e.g. `## Technical detail`, `## For developers`) or a callout (`> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`, rendered by `src/app/docs/_components/Callout.tsx`). Don't flag a well-marked aside as a clarity problem; do flag technical detail that's mixed into the main instructions unmarked. A page with warnings or "only applies if" notes buried in body prose that should be callouts is a clarity gap worth noting.

## 1. Pick the scope

- If the skill was invoked with an argument, treat it as a path or slug under `src/content/docs/` (e.g. `<section>/<page>`, with or without the `.mdx` extension) and audit just that one page.
- Otherwise, list every `.mdx`/`.md` file under `src/content/docs/` and audit all of them.

## 2. Find the doc's source of truth

Docs pages don't carry an explicit pointer back to the code they describe, so reconstruct it. The docs describe three code surfaces, and a given page usually lives in one of them:

- **The web app** (anything about UI labels, dashboards, screens, permissions, or business rules enforced when a user clicks something): grep `winnonah/src/*`.
- **The winnonah Python sidecar and cron scripts** (anything about a background sync, a scheduled job, fax/document processing, appointment reminders, or an internal report that isn't a screen), all under `winnonah/python/`:
  - `api.py` is the FastAPI sidecar the web app calls (routes are `@app.get`/`@app.post`); its lifespan also starts one in-process loop, `appointment_reminders.reminder_cron()`.
  - `main.py` is a Typer CLI (the `main(...)` command) that the deployment's cron invokes for the recurring TherapyAppointment sync, fax, and referral work.
  - Other root scripts run standalone on their own cron: `appointment_reminders.py`, `categorize_documents.py`, `fax_categorization.py`, `babynet_report.py`, `notify_reports.py`, `migrate_drive.py`, `greeter_proxy.py`, plus one-off `remediate_*.py`.
  - Shared logic is in `winnonah/python/utils/` (`appointments.py`, `database.py`, `clients.py`, `google.py`, `therapyappointment.py`, `fax*.py`, `medicaid.py`, `timezone.py`, `constants.py`). Cadences quoted in docs come from the deployment's crontab/compose, not the script source, so flag a stated schedule as suspected drift unless the doc itself is the source of truth for it.
- **The questionnaires repo** (anything about sending or receiving questionnaires, records requests, or piecework/billing exports): root scripts `qsend.py`, `qreceive.py`, `records-request.py`, `piecework.py`, `log-server.py` and `questionnaires/utils/`.

The two Python surfaces share config through the `py-config` tRPC router (`winnonah/src/server/api/routers/py-config.ts`) and keep `timezone.py`/`constants.py` in sync, so a business rule quoted in a doc may be defined on the TS side and consumed in Python, check both.

- Pull every bolded UI label (`**Like This**`), button/field name, permission string, dashboard section name, punch-list column name, cron cadence, and script filename mentioned in the doc, then grep the exact strings across the surface identified above.
- A doc page that's clearly about one script or one router (most of them are) usually resolves to a small, obvious set of files, read those in full rather than guessing from grep snippets alone.

## 3. Compare claim by claim

Go through the doc section by section. For each concrete, falsifiable claim, a label's exact text, a flag's default value, a permission's name, a business rule ("three reminders", "14 days", "ADHD clients skip Eval questionnaires"), a described sequence of steps, check it against the current source. Note:

- **Confirmed drift**: the doc states something the code demonstrably no longer does (renamed field, removed step, changed default, flipped condition). Cite the file and what changed.
- **Suspected drift**: something looks off but you can't fully confirm from static reading (e.g. behavior that depends on remote config or runtime data). Flag it as worth a second look rather than asserting it's wrong.
- **New, undocumented behavior**: the code has a branch, flag, or edge case the doc doesn't mention at all. Worth surfacing, but don't treat "doc is incomplete" the same as "doc is wrong", keep them separate in the report.

Don't flag wording/style differences that don't change meaning. This is an accuracy audit, not a copy edit.

## 4. Reader-test the page

Accuracy is necessary but not sufficient: a page can be technically correct and still leave a non-technical staff member stuck. After the claim-by-claim pass, check whether the page actually works for its reader.

- Write 5 to 10 questions a staff member would realistically bring to this page ("how do I know it worked?", "what if the client isn't in the list?", "who is allowed to do this?").
- Spawn a subagent (the `Explore` agent is fine) given only the current page text, no repo, no context, and ask it those questions plus "what here assumes knowledge the reader doesn't have?" and "anything ambiguous or contradictory?".
- Where the reader can't answer from the page, or answers wrong, or has to guess, record it as a **coverage gap** or **clarity gap**, separate from drift. These aren't "the doc is wrong", they're "the doc doesn't do its job", and a human deciding what to fix needs both.

When auditing the whole site at once, the reader test is optional per page: run it on pages that already showed drift or look thin, skip it on pages that came back clean and read well.

## 5. Report

For each page audited, give a short verdict (accurate / minor drift / significant drift) and a bulleted list of findings. Group them: **drift** findings each carry the doc's claim, what the code actually shows, and the file/line as evidence; **coverage / clarity gaps** from the reader test each carry the question the reader couldn't answer and why. If a page has no findings, say so briefly rather than skipping it silently, that's useful signal too.

If the user wants the drift fixed, that's a separate follow-up, don't start editing the docs as part of running this skill.
