# toggle-group

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), pristine wrapper (initial CUSTOMIZED classification was a false positive from an import-path normalization bug in my own classification script), merged clean.

## Changed

- `src/app/_components/ui/toggle-group.tsx`: `ToggleGroup` from `radix-ui` -> `@base-ui/react/toggle-group`, item primitive from `@base-ui/react/toggle`. Depends on the already-migrated `toggle.tsx`. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, needs consumer sweep**: `type="single"`/`type="multiple"` prop is dropped; replaced by a `multiple` boolean, and value shape becomes arrays (same treatment as Accordion). Consumer `RichTextEditor.tsx` uses `type="multiple"` (line 197) and `type="single"` (lines 250, 296, 309, 321). Fixed in the consumer sweep, not here.

## Verify by hand

- Toggle formatting buttons in the rich text editor toolbar (bold/italic, alignment) and confirm single-select and multi-select groups behave correctly.
