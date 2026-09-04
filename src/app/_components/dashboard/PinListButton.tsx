"use client";

import { Button } from "@ui/button";
import { Pin, PinOff } from "lucide-react";
import { usePinnedList } from "~/hooks/use-pinned-list";
import type { PinnedList } from "~/lib/pinned-list";

/**
 * Pin/unpin a list (a dashboard section or the Insurance Review list) so its
 * clients get a prev/next bar on their pages. Shared by the dashboard
 * (`Dashboard.tsx`) and the home page widgets (`DashboardSectionWidget.tsx`,
 * `ClientListWidgets.tsx`).
 */
export function PinListButton({ pinned }: { pinned: PinnedList }) {
	const { isPinned, setPinned, clearPinned } = usePinnedList();
	const active = isPinned(pinned);

	return (
		<Button
			aria-label={
				active ? "Unpin this list" : "Pin this list for prev/next navigation"
			}
			className="font-medium text-muted-foreground text-xs"
			onClick={() => (active ? clearPinned() : setPinned(pinned))}
			size="sm"
			type="button"
			variant="ghost"
		>
			{active ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
			<span>{active ? "Pinned for prev/next" : "Pin this list"}</span>
		</Button>
	);
}
