# select

2026-08-07, golden pair via hand-resolution of a 4-conflict three-way merge (radix-nova ancestor, base-nova target). Customizations preserved: project's lucide icons in place of `IconPlaceholder`, removal of `cn-menu-target`/`cn-menu-translucent` classes, and the project-added `description` prop/feature on `SelectItem` (renders a secondary line of muted text below the item label, switches the item to a column layout).

## Changed

- `src/app/_components/ui/select.tsx`: `Select` from `radix-ui` -> `@base-ui/react/select`. Anatomy changed from `Portal > Content > Viewport` to `Portal > Positioner > Popup > List`. `SelectContent`'s `position="popper"|"item-aligned"` prop is replaced by `alignItemWithTrigger` (boolean, default `true`, on the Positioner). Scroll button parts renamed: `ScrollUpButton`/`ScrollDownButton` -> `ScrollUpArrow`/`ScrollDownArrow`. The project's `description` prop on `SelectItem` was replayed onto the new structure (kept the `flex-col items-start` className branch and the trailing description `<span>`). Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- No consumer used `position="popper"`/`position="item-aligned"` explicitly (confirmed via grep), so the new `alignItemWithTrigger` default (`true`, closest to the old `item-aligned` behavior) matches existing usage everywhere.
- `onValueChange(value: string)` widens to `onValueChange(value: Value | null, eventDetails)` in Base UI. Several consumers pass a plain `useState<string>` setter directly; flagged for the consumer sweep to confirm typing still holds (widen state type or wrap the setter as needed), not patched here.

## Verify by hand

- Open a select dropdown, confirm scroll-up/scroll-down arrows appear for long lists, confirm the selected item's check indicator shows, and confirm any select item with a `description` renders the secondary text correctly.
