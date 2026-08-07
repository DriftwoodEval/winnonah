# label

2026-08-07, golden pair via shadcn CLI (`shadcn add label --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/label.tsx`: no Base UI counterpart for Label exists (per hard rule), so the registry variant drops `LabelPrimitive.Root` from `radix-ui` entirely and renders a native `<label>` with the same `data-slot="label"` and classes. Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/app/_components/ui/label.tsx` returns nothing.

## Left alone

None, single-file component.

## Behavior changes

None. Native `<label>` behaves identically to Radix's Label.Root for this component's use (peer/group styling via CSS, no JS behavior was added by Radix here).

## Verify by hand

- Click a form label and confirm it focuses/toggles the associated input.
