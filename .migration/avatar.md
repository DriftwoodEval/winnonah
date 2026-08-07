# avatar

2026-08-07, golden pair via shadcn CLI (`shadcn add avatar --overwrite`, base-nova), pristine wrapper, migrated clean.

## Changed

- `src/app/_components/ui/avatar.tsx`: `Avatar` from `radix-ui` -> `@base-ui/react/avatar`. `AvatarImage`'s `delayMs` prop is renamed to `delay` by Base UI; no consumer in this codebase used `delayMs` (confirmed via grep), so no call-site change needed. Leftover scan clean.

## Left alone

None, single-file component.

## Behavior changes

None observed at current usage (no consumer used `delayMs`).

## Verify by hand

- Confirm avatars render images where available and fall back to initials/icon when the image fails to load.
