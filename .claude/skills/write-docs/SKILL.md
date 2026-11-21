---

name: write-docs
description: Drafts a new documentation page (or a substantial new section of one) under src/content/docs, grounded in the actual source code and written for a non-technical staff audience. Use when the user asks to document a feature, script, dashboard, or procedure that has no page yet, or to fill a real gap in an existing page. Companion to verify-docs, which audits pages that already exist. Produces an .mdx draft, reader-tests it, and validates it; does not deploy or announce anything.
---

# Write Docs

Drafts new pages for `src/content/docs/`. Counterpart to `verify-docs`: that checks existing prose against the code, this writes new prose from the code.

Two standards:

1. **Accurate.** Every claim traces to source before it goes in.
2. **Written for a layperson.** Describe what the user sees and does. No implementation detail, no jargon. Define any app-specific term on first use. Audience exceptions (`development/` pages, fenced technical asides) are in [reference.md](../verify-docs/reference.md).

House rules (frontmatter keys, category folders, image paths, the full callout set) live in the `development/writing-docs` page. Read it first. This skill covers research, structure, and review.

## 1. Gather context before drafting

Don't write from a one-line request. Pin down:

- **What** is documented: a concrete entry point (URL, button, screen, script filename, cron job).
- **Who** does it and **when**: which staff role, at what point, triggered by what.
- **Section**:
  - **procedures/**: a task staff carry out, step by step.
  - **documentation/**: a feature or screen and what it does.
  - **development/**: engineering-facing.
  - If the category has topic subfolders, use the one that fits. Don't create a subfolder for a single page.
- Whether a page already covers this. If so, it's an edit: confirm with the user before creating a duplicate.

Ask the user to dump what they know (background, edge cases, what confuses people), then ask 3 to 8 targeted questions for the gaps.

Pick the filename last: kebab-case `.mdx`. URL is `/docs/<section>/<slug>`.

## 2. Find the source of truth

Follow "Source of truth" in [reference.md](../verify-docs/reference.md). Read the relevant files in full and trace the real flow: which component renders the button, what a click does, what gets written, which permission gates it, the numeric rules. Capture exact labels, permission names, defaults, and thresholds, then translate to plain language.

If a claim can't be pinned to code (remote config, external system, operational convention), leave it out or write it as an explicit "as configured" line and flag it to the user.

## 3. Draft the page

Open two or three existing pages in the same section and follow their pattern.

- **Frontmatter**: `title` only, unique within its section (the sidebar sorts by title). Add `needsCleanup: true` if it's technical or lacks screenshots, or `notDone: true` for an unfinished stub.
- **Opening**: one short paragraph, no heading: what the thing is and when staff touch it.
- **Body**:
  - Procedures: numbered `## 1. Step name`, one action per section, in the order staff do them.
  - Feature docs: topical `##` headings (what it shows, how sorting works, who can see it, edge cases).
  - Lead each section with the decision or unknown. No throat-clearing.
  - Technical asides go under their own heading or in a callout, never inside a step.
- **Callouts**: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`. Use one for any "don't do X", "only applies if", or context that would interrupt the steps. Two or three per page is normal.
- **UI labels**: bold the exact on-screen text from the code, `**Log Attempt**`, never a paraphrase.
- **Cross-links**: `[Link text](/docs/<section>/<slug>)`, only to pages that exist.
- **Images**: only if the user provides them, saved next to the `.mdx` and referenced by bare filename. Never invent filenames. If the page needs screenshots you don't have, set `needsCleanup: true` and tell the user which to grab.
- **Voice**: address staff as "you". Plain language.

Write full sections to the file. After the first draft, make surgical edits, don't reprint the page.

## 4. Reader-test the draft

Run the "Reader test" in [reference.md](../verify-docs/reference.md). Fix the page, not the test, and repeat until it reads clean. Skip it only for a pure `development/` reference page.

## 5. Validate and hand off

- Run `mise run check:docs` and fix what it flags.
- If this documents a newly shipped user-facing feature, remind the user a `src/content/docs/changelog/index.mdx` entry may be warranted (validate with `pnpm exec tsx scripts/ci/validate-changelog.ts`). Don't add one unless asked.
- Give the user the new file path, a summary of what you documented, and an explicit list of anything you couldn't verify from code.
