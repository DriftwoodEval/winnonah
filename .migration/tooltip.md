# tooltip

2026-08-07, golden pair via shadcn CLI (`shadcn add tooltip --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/tooltip.tsx`: `Tooltip` from `radix-ui` -> `@base-ui/react/tooltip`. Anatomy changed from `Portal > Content` to `Portal > Positioner > Popup` plus a real `Arrow` primitive (previously the arrow was a plain styled `<span>` or absent; now `TooltipPrimitive.Arrow` per `wrapper-shapes.md`). `TooltipProvider`'s `delayDuration`/`skipDelayDuration` props are renamed/dropped to a single `delay` prop; the wrapper already exposes `delay = 0` as its default. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, not patched**: `disableHoverableContent` has no Base UI equivalent and was dropped. No consumer in this codebase used it (confirmed via grep), so no functional impact, but hoverable tooltip content is now always allowed if a future consumer relied on disabling it.
- `skipDelayDuration` concept is dropped entirely (single `delay` now governs all tooltips under a Provider). Not used anywhere in this codebase.

## Verify by hand

- Hover over a handful of tooltip triggers (header actions, dashboard icons) and confirm the tooltip appears with correct arrow positioning and the existing delay feel.
