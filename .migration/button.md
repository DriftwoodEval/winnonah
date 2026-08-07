# button

2026-08-07, golden pair via shadcn CLI (`shadcn add button --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/button.tsx`: swapped the hand-rolled `Slot`-based `asChild` composition for the real `@base-ui/react/button` `Button` primitive (`src/app/_components/ui/button.tsx:1,43-56`). The primitive supports `render` (from `useRender` internally) in place of `asChild`. `data-variant`/`data-size` data attributes were dropped by the registry variant since variant/size are now baked into `className` only; `data-slot="button"` kept. Leftover scan clean: `grep -n "radix-ui\|@radix-ui" src/app/_components/ui/button.tsx` returns nothing.

## Left alone

None, single-file component.

## Behavior changes

- `asChild` is no longer a prop on `Button`. Every call site that passed `asChild` to render a different element inside a Button-styled wrapper breaks at the type level and must be rewritten. This surfaced ~40 call sites across the app; tracked and fixed in the consumer sweep, not here.

## Verify by hand

- Click a handful of primary/secondary/destructive/link buttons across the app and confirm hover/active/disabled styling still matches.
- Tab to a button and confirm the focus ring renders.
