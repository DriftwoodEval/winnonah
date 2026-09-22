---
name: write-docs
description: Drafts a new documentation page (or a substantial new section of one) under src/content/docs, grounded in the actual source code and written for a non-technical staff audience. Use when the user asks to document a feature, script, dashboard, or procedure that has no page yet, or to fill a real gap in an existing page. Companion to verify-docs, which audits pages that already exist. Produces an .mdx draft, reader-tests it, and validates it; does not deploy or announce anything.
---

# Write Docs

Drafts new pages for the docs site at `src/content/docs/`. Counterpart to `verify-docs`: that skill checks existing prose against the code, this one writes new prose from the code.

Two standards every page has to meet:

1. **Accurate.** Every factual claim traces to source before it goes in, the same bar `verify-docs` holds old pages to.
2. **Written for a layperson.** The audience is non-technical staff who need to operate the app. No implementation detail, no jargon, no "the mutation validates". Describe what the user sees on screen and what they do. Define any app-specific term the first time it appears. If a sentence would only make sense to an engineer, it's wrong for the main flow.

   Two exceptions:
   - Pages under `development/` are written for software engineers. Architecture, deploy, local setup, technical vocabulary all fine there.
   - On any page, a technical aside is allowed when it's clearly separated from the instructions: its own heading (`## Technical detail`, `## For developers`) or a callout (see below). Never mix engineer-level detail into a numbered step or the opening paragraph.

The mechanical house rules (frontmatter keys, category folders, image paths) live in the `development/writing-docs` page. Read it first; this skill covers research, structure, and review.

## 1. Gather context before drafting

Don't start writing from a one-line request. First pin down:

- **What** exactly is being documented: a concrete entry point (URL, button, screen name, script filename, cron job).
- **Who** does this and **when**: which staff role, at what point in their workflow, what triggers them to do it.
- **Section** (top-level folder):
  - **procedures/** — a task staff carry out, step by step ("how to do X").
  - **documentation/** — a feature or screen and what it does ("what X is").
  - **development/** — engineering-facing (architecture, deploy, setup). Write these for developers, not the layperson audience.
  - Categories can have topic subfolders (`procedures/appointments/`, `documentation/clients/`). If the target category already uses subfolders, put the page in the one it belongs to; don't create a new subfolder for a single page.
- Whether a page already covers this. If one does, this is an edit, not a new file, confirm with the user before creating a duplicate.

Ask the user to dump whatever they know (background, edge cases, why it works the way it does, what confuses people about it). Then ask 3 to 8 targeted questions to fill the gaps you still have. Cheap to ask now, expensive to guess wrong.

Pick the filename last: kebab-case slug, `.mdx`. URL is `/docs/<section>/<slug>`.

## 2. Find the source of truth

Same three code surfaces as `verify-docs` (read section 2 of that skill for the full breakdown):

- **T3 web app** — `winnonah/src/app/_components/**`, `winnonah/src/server/api/routers/**`, `winnonah/src/server/db/schema.ts`, `winnonah/src/lib/**` for anything UI, permission, or business-rule shaped.
- **winnonah Python sidecar and cron scripts** — `winnonah/python/` (`api.py`, `main.py`, standalone root scripts) and `winnonah/python/utils/` for background syncs, scheduled jobs, fax/document processing, reminders, internal reports.
- **questionnaires repo** — root scripts and `questionnaires/utils/` for questionnaire send/receive, records requests, piecework exports.

Read the relevant files in full. Trace the real flow: which component renders the button, what happens when it's clicked, what gets written, which permission gates it, what the numeric rules are ("3 attempts", "21 days"). Capture exact label text, permission names, defaults, and thresholds as you go, then translate them into plain language for the page. The page says what staff experience; the code is just how you learn what that is.

If a claim can't be pinned to code (depends on remote config, an external system, or an operational convention), leave it out or write it as an explicit "as configured" line and flag it to the user for confirmation.

## 3. Draft the page

Open two or three existing pages in the same section and follow their pattern.

- **Frontmatter**: `title` only in the normal case. Title must be unique within its section and read well in the sidebar (sidebar sorts alphabetically by title). Add `needsCleanup: true` if you're leaving it technical or without screenshots, or `notDone: true` if it's an unfinished stub; each renders a banner and both are booleans the validator checks.
- **Opening**: one short paragraph, no heading, saying what the thing is and when staff touch it. The outreach and merge pages are good models.
- **Body**:
  - Procedures: numbered `## 1. Step name`, `## 2. ...`, one action per section, in the order staff do them.
  - Feature docs: topical `##` headings (what it shows, how sorting works, who can see it, edge cases).
  - Lead each section with the unknown or the decision, not throat-clearing. Every sentence should carry information the reader needs.
  - Technical asides (how a sync decides a match, why a rule exists) go under their own `## Technical detail` / `## For developers` heading or in a callout, never inside a step.
- **Callouts**: use them freely, they make a page scannable. Write them as `> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]` blockquotes (optionally `> [!WARNING] Custom title` on the marker line); the body below the marker is normal Markdown. Those five cover almost everything; a wider Obsidian-style set plus aliases exists (see `development/writing-docs`) but reach for it only when one genuinely fits better. Reach for a callout whenever the page has a "don't do X", a "this only applies if", a shortcut, or a piece of context that would otherwise interrupt the steps. Two or three per page is normal; don't wrap every paragraph.
- **UI labels**: bold the exact on-screen text taken from the code, `**Log Attempt**`, `**Needs Outreach**`, never a paraphrase.
- **Cross-links**: `[Link text](/docs/<section>/<slug>)`. The validator fails the build on a link that doesn't resolve, so only link to pages that exist.
- **Images**: only if the user provides them. File goes next to the `.mdx`, referenced by bare filename. Never invent screenshot filenames. If the page clearly needs screenshots the user hasn't given you, set `needsCleanup: true` and tell them which shots to grab.
- **Voice**: address staff directly ("you" / "staff"). Plain language about what they see and do. No AI-isms, no em dashes (use comma, colon, period), per repo style rules.

Write full sections to the file. For every revision after the first, make surgical edits, don't reprint the page.

## 4. Reader-test the draft

Before handing off, check it stands on its own for someone who can't see the code or this conversation.

- List 5 to 10 questions a staff member would realistically ask about this task or feature.
- Spawn a subagent (the `Explore` agent is fine) that is given only the draft page text, no repo access, no context, and asked those questions plus "what here assumes knowledge you don't have?" and "anything contradictory or ambiguous?".
- Where the reader gets it wrong or gets stuck, fix the page, not the test. Repeat until it reads clean.
- For a `development/` page, run the same test but tell the subagent to answer as a software engineer new to the codebase; skip it entirely only for a pure reference page.

## 5. Validate and hand off

- Run `mise run check:docs` (frontmatter, cross-links, image references). Fix what it flags.
- If this documents a newly shipped user-facing feature, remind the user a `src/content/docs/changelog/index.mdx` entry may be warranted (separate validator: `pnpm exec tsx scripts/validate-changelog.ts`), but don't add one unless asked.
- Give the user the new file path, a summary of what you documented, and an explicit list of anything you couldn't verify from code. Let them review before it's committed or deployed.
