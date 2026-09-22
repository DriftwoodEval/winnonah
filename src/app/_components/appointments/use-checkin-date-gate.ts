"use client";

import { useSession } from "next-auth/react";
import { formatInBusinessTime, IS_DEV } from "~/lib/utils";

/**
 * Check-in and check-out normally only apply to today or an earlier day. Local
 * development (outside impersonation) lifts that limit so any day can be
 * exercised while testing.
 *
 * Returns a predicate that takes a business-local "yyyy-MM-dd" date string.
 */
export function useCheckinDateGate() {
	const { data: session } = useSession();
	const anyDay = IS_DEV && !session?.user.isImpersonating;
	return (businessDate: string) =>
		anyDay || businessDate <= formatInBusinessTime(new Date(), "yyyy-MM-dd");
}
