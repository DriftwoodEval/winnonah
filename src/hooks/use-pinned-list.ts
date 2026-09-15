import { useSession } from "next-auth/react";
import { useMemo } from "react";
import {
	type PinnedList,
	type PinnedListEntry,
	pinnedListLabel,
	resolvePinnedListEntries,
} from "~/lib/pinned-list";
import { api } from "~/trpc/react";

/**
 * The list a user has pinned to walk through client by client, plus its
 * resolved, ordered entries. Pinning is set from the dashboard
 * (`Dashboard.tsx`); the prev/next bar on a client page (`PinnedListNav.tsx`)
 * reads it here.
 */
export function usePinnedList() {
	const { data: session } = useSession();
	const utils = api.useUtils();

	const { data: pinned, isLoading } = api.users.getPinnedList.useQuery(
		undefined,
		{ refetchOnMount: "always" },
	);

	const isSection = pinned?.kind === "dashboardSection";
	const isAdminReview = pinned?.kind === "adminReview";

	// lazy: on a client page this fires the same cached getDashboardData query
	// the dashboard uses. Extra fetch, acceptable; refetch left off.
	const { data: dashboardData } = api.google.getDashboardData.useQuery(
		undefined,
		{ enabled: isSection },
	);
	const { data: adminClients } = api.adminReview.getAllEnabled.useQuery(
		undefined,
		{ enabled: isAdminReview },
	);
	const { data: listFilters } = api.users.getListFilters.useQuery(undefined, {
		enabled: isAdminReview,
		refetchOnMount: "always",
	});

	const setPinnedList = api.users.setPinnedList.useMutation({
		onSuccess: () => utils.users.getPinnedList.invalidate(),
	});
	const clearPinnedList = api.users.clearPinnedList.useMutation({
		onSuccess: () => utils.users.getPinnedList.invalidate(),
	});
	const updateListFilters = api.users.updateListFilters.useMutation({
		onSuccess: () => utils.users.getListFilters.invalidate(),
	});

	const adminFilters = listFilters?.adminReview ?? [];

	const entries = useMemo<PinnedListEntry[]>(() => {
		if (!pinned) return [];
		return resolvePinnedListEntries(pinned, {
			dashboardSections: dashboardData?.sections,
			adminClients: adminClients ?? undefined,
			adminFilters: listFilters?.adminReview,
			userEmail: session?.user?.email,
		});
	}, [pinned, dashboardData, adminClients, listFilters, session]);

	return {
		pinned: pinned ?? null,
		label: pinned ? pinnedListLabel(pinned) : null,
		entries,
		isLoading,
		isPinned: (candidate: PinnedList) => {
			if (!pinned || pinned.kind !== candidate.kind) return false;
			if (
				pinned.kind === "dashboardSection" &&
				candidate.kind === "dashboardSection"
			) {
				return pinned.title === candidate.title;
			}
			return true;
		},
		setPinned: (list: PinnedList) => setPinnedList.mutate(list),
		clearPinned: () => clearPinnedList.mutate(),
		adminFilters,
		setAdminFilter: (key: "mine" | "waiting", on: boolean) => {
			const next = on
				? [...adminFilters.filter((v) => v !== key), key]
				: adminFilters.filter((v) => v !== key);
			updateListFilters.mutate({ key: "adminReview", filters: next });
		},
		clearAdminFilters: () =>
			updateListFilters.mutate({ key: "adminReview", filters: [] }),
	};
}

/** Prev/next position of one client within the pinned list. */
export function usePinnedListNav(currentHash: string) {
	const {
		pinned,
		label,
		entries,
		clearPinned,
		adminFilters,
		setAdminFilter,
		clearAdminFilters,
	} = usePinnedList();

	const index = entries.findIndex((e) => e.hash === currentHash);
	const onList = index !== -1;

	return {
		pinned,
		label,
		entries,
		onList,
		index,
		total: entries.length,
		prev: onList && index > 0 ? entries[index - 1] : null,
		next: onList && index < entries.length - 1 ? entries[index + 1] : null,
		clearPinned,
		adminFilters,
		setAdminFilter,
		clearAdminFilters,
	};
}
