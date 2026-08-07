# scroll-area

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), one real structural conflict hand-resolved. Customization preserved: project-added `viewportRef` prop (threads a ref onto the Viewport element, used for virtualization in `ClientsList.tsx`).

## Changed

- `src/app/_components/ui/scroll-area.tsx`: `ScrollArea` from `radix-ui` -> `@base-ui/react/scroll-area`. Part renames: `ScrollAreaScrollbar` -> `Scrollbar`, `ScrollAreaThumb` -> `Thumb` (wrapper export names `ScrollArea`/`ScrollBar` unchanged). Hand-resolved by keeping the project's `viewportRef` prop threaded onto the renamed primitives. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

- **Flagged, needs consumer sweep**: `type="always"|"scroll"|...` prop is dropped entirely by Base UI. Consumers using `type="auto"`: `issuesList.tsx` (6 usages), `AvailabilityList.tsx` (3 usages). These no-op silently since the prop is just unused, not a type error; fixed for cleanliness in the consumer sweep.

## Verify by hand

- Scroll a long list inside a ScrollArea (e.g. issues list, client list) and confirm the scrollbar thumb appears, drags correctly, and the virtualized `ClientsList` still scrolls smoothly (verifies `viewportRef` still works).
