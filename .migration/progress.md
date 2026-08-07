# progress

2026-08-07, golden pair via three-way merge (radix-nova ancestor, base-nova target), one real structural conflict hand-resolved. Customization preserved: thicker track (`h-2` vs registry's `h-1`) and `bg-primary/20` track color (vs registry's `bg-muted`) plus `w-full flex-1` indicator sizing.

## Changed

- `src/app/_components/ui/progress.tsx`: `Progress` from `radix-ui` -> `@base-ui/react/progress`. Anatomy restructured from a single `Root > Indicator` to `Root > Track > Indicator`, with new `ProgressLabel`/`ProgressValue` exports added by the registry. Hand-resolved the merge conflict by taking the new anatomy and replaying the project's track/indicator className customizations onto `ProgressTrack`/`ProgressIndicator`. Leftover scan clean.
- `src/app/_components/tasks/TaskQueueBubble.tsx:92-100`: this was the one consumer passing `className="h-1.5"` directly to `<Progress>` to control track height; under the old anatomy `Progress`'s className applied to the element containing the indicator, so this worked. Under the new anatomy `Progress`'s className applies to an outer flex-wrap container, not the track, so the height override would have silently stopped working. Fixed by passing children explicitly (`<ProgressTrack className="h-1.5"><ProgressIndicator /></ProgressTrack>`).

## Left alone

None.

## Behavior changes

None beyond the anatomy change (handled above); the visual customization (thicker, tinted track) was preserved.

## Verify by hand

- Confirm the task queue bubble's progress bars render at the expected thinner height, and the general Progress component elsewhere still shows a thicker `h-2` bar.
