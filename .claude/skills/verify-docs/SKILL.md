---

name: verify-docs
description: Audits one or more docs pages under src/content/docs against the actual source code they describe, reporting where the prose has drifted (renamed labels, changed permissions, removed features, changed business rules) and where it leaves a non-technical reader stuck (coverage and clarity gaps). Use when the user asks to verify, audit, or check a docs page for accuracy, or periodically to sanity-check the docs site. Read-only, does not edit files. Takes an optional argument naming a page by its path or slug under src/content/docs (e.g. "<section>/<page>"); without one, audits every page.
---

# Verify Docs

A human-triggered accuracy audit for `src/content/docs/`. `mise run check:docs` only catches structural rot (dead links, missing images, bad frontmatter). It can't tell whether the prose still matches the code. This skill does that by reading each page next to its source.

Read-only: report findings, never edit docs. Fixes are a separate follow-up.

"Drift" means the page describes something the user does or sees that the code no longer matches: a renamed button, a changed rule, a removed step. An internal rename that never surfaces to the user is not drift. Don't flag prose for being too plain. Audience rules are in [reference.md](reference.md).

## 1. Pick the scope

With an argument, treat it as a path or slug under `src/content/docs/` (with or without `.mdx`) and audit that page. Without one, audit every `.mdx`/`.md` file there.

## 2. Find the source of truth

Follow "Source of truth" in [reference.md](reference.md).

## 3. Compare claim by claim

For each concrete, falsifiable claim (a label's exact text, a default, a permission name, a business rule like "14 days", a sequence of steps), check it against current source. Sort findings into:

- **Confirmed drift**: the code demonstrably no longer does this. Cite the file and what changed.
- **Suspected drift**: looks off but depends on remote config or runtime data. Flag for a second look.
- **Undocumented behavior**: the code has a branch, flag, or edge case the doc never mentions. Keep separate from drift: incomplete is not wrong.

Ignore wording differences that don't change meaning.

## 4. Reader-test the page

Run the "Reader test" in [reference.md](reference.md). When auditing the whole site, only run it on pages that showed drift or look thin.

## 5. Report

Per page: a verdict (accurate / minor drift / significant drift) and bulleted findings.

- **Drift**: the doc's claim, what the code shows, file and line.
- **Coverage / clarity gaps**: the question the reader couldn't answer and why.

If a page has no findings, say so briefly.
