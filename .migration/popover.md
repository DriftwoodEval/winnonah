# popover

2026-08-07, golden pair via shadcn CLI (`shadcn add popover --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/popover.tsx`: `Popover` from `radix-ui` -> `@base-ui/react/popover`. Anatomy changed from `Portal > Content` to `Portal > Positioner > Popup` (Base UI's standard overlay shape); `align`/`alignOffset`/`side`/`sideOffset` moved from Content onto the new Positioner. `PopoverTitle`/`PopoverDescription` now wrap the real `PopoverPrimitive.Title`/`Description` primitives instead of bare `<h2>`/`<p>`. `PopoverAnchor` export removed: no Base UI counterpart and no consumer used it (confirmed via grep). Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- `PopoverAnchor` is gone from the public API. Not used anywhere in this codebase, no call-site impact.
- `openDelay`/`closeDelay`, if ever added on `Popover` (Root) in the future, must go on `PopoverTrigger` instead per Base UI's API; not currently used anywhere so no fix needed now.
- `onFocusOutside`/`onPointerDownOutside` on `PopoverContent`/`Popup` are consolidated differently in Base UI (see overlays.md); two call sites (`HeaderActions.tsx`, `date-time-picker.tsx`) use these and were fixed in the consumer sweep.

## Verify by hand

- Open a popover, confirm positioning near its trigger, and confirm it closes on outside click and Escape.
