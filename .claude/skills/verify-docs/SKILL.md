---
name: verify-docs
description: Audits one or more docs pages under src/content/docs against the actual source code they describe, and reports where the prose has drifted (renamed labels, changed permissions, removed features, changed business rules). Use when the user asks to verify, audit, or check a docs page for accuracy, or periodically to sanity-check the docs site. Read-only, does not edit files. Takes an optional argument naming a page (e.g. "procedures/piecework"); without one, audits every page whose frontmatter has needsCleanup or notDone set.
---

# Verify Docs

This is a periodic, human-triggered accuracy audit for the docs site at `src/content/docs/`. It exists because `scripts/validate-docs.ts` (run via `mise run check:docs`) only catches structural rot, broken links, missing images, malformed frontmatter, not whether the prose still matches what the code actually does. That's a judgment call an LLM has to make by re-reading the doc next to its source, this skill is that process.

Never auto-edit a doc as part of this skill. Report findings; let a human (or a follow-up request) decide what to change.

## 1. Pick the scope

- If the skill was invoked with an argument, treat it as a path or slug under `src/content/docs/` (e.g. `procedures/piecework`, or `procedures/piecework.mdx`) and audit just that one page.
- Otherwise, list every `.mdx`/`.md` file under `src/content/docs/` whose frontmatter has `needsCleanup: true` or `notDone: true`, and audit all of them. These are the pages self-flagged as not fully settled, they're the highest-value targets. If the user asked for a full sweep regardless of that flag, audit every page instead.

## 2. Find the doc's source of truth

Docs pages don't carry an explicit pointer back to the code they describe, so reconstruct it:

- Pull every bolded UI label (`**Like This**`), button/field name, permission string, dashboard section name, punch-list column name, and script filename mentioned in the doc.
- Grep the relevant repo(s) for those exact strings: `winnonah/src/app/_components/**`, `winnonah/src/server/api/routers/**`, `winnonah/src/server/db/schema.ts`, `winnonah/src/lib/constants.ts` for anything UI/permission-shaped; the `questionnaires` repo's root scripts and `utils/` for anything describing a Python automation script (qsend.py, qreceive.py, records-request.py, piecework.py, and their helpers).
- A doc page that's clearly about one script or one router (most of them are) usually resolves to a small, obvious set of files, read those in full rather than guessing from grep snippets alone.

## 3. Compare claim by claim

Go through the doc section by section. For each concrete, falsifiable claim, a label's exact text, a flag's default value, a permission's name, a business rule ("three reminders", "14 days", "ADHD clients skip Eval questionnaires"), a described sequence of steps, check it against the current source. Note:

- **Confirmed drift**: the doc states something the code demonstrably no longer does (renamed field, removed step, changed default, flipped condition). Cite the file and what changed.
- **Suspected drift**: something looks off but you can't fully confirm from static reading (e.g. behavior that depends on remote config or runtime data). Flag it as worth a second look rather than asserting it's wrong.
- **New, undocumented behavior**: the code has a branch, flag, or edge case the doc doesn't mention at all. Worth surfacing, but don't treat "doc is incomplete" the same as "doc is wrong", keep them separate in the report.

Don't flag wording/style differences that don't change meaning. This is an accuracy audit, not a copy edit.

## 4. Report

For each page audited, give a short verdict (accurate / minor drift / significant drift) and a bulleted list of findings, each with: the doc's claim, what the code actually shows, and the file/line as evidence. If a page has no findings, say so briefly rather than skipping it silently, that's useful signal too.

If the user wants the drift fixed, that's a separate follow-up, don't start editing the docs as part of running this skill.
