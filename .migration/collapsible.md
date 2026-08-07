# collapsible

2026-08-07, golden pair via shadcn CLI (`shadcn add collapsible --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/collapsible.tsx`: `Collapsible` from `radix-ui` -> `@base-ui/react/collapsible`. Part rename: `CollapsibleTrigger` -> `Trigger` (wrapper export name unchanged), `CollapsibleContent` -> `Panel` (wrapper export name unchanged). Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

None observed; open/close prop surface (`open`/`defaultOpen`/`onOpenChange`) unchanged.

## Verify by hand

- Expand/collapse a collapsible section and confirm the animation and content visibility work.
