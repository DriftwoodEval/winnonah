"use client";

import { Checkbox } from "@ui/checkbox";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@ui/popover";
import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	HEADER_ITEM_DEFS,
	type HeaderItemCategory,
	type HeaderItemDef,
	type HeaderItemId,
} from "~/lib/header-items";
import type { PermissionId } from "~/lib/types";
import { api } from "~/trpc/react";

const ITEM_PERMISSIONS: Partial<Record<HeaderItemId, PermissionId>> = {
	dashboard: "pages:dashboard",
	availability: "pages:availability",
	scheduling: "pages:scheduling",
	"fax-categorization": "fax:categorization:review",
	"work-summary": "pages:work-summary",
	calculator: "pages:calculator",
	"redaction-toggle": "settings:pii-redaction",
};

const GROUP_ORDER: (HeaderItemCategory | "General")[] = [
	"General",
	"Clients",
	"Schedule",
	"Reports",
	"Tools",
];

const CHECKBOX_COLUMN_WIDTH = "w-16";

function useItemAvailability(): Record<HeaderItemId, boolean> {
	const { data: session } = useSession();
	const can = useCheckPermission();

	const canSeeEvalReportDashboard =
		(session?.user.isEvaluator ?? false) || can("evaluator-dashboard:admin");
	const canSeeClaimReports =
		session?.user.maxClaimedReports !== 0 ||
		can("reports:approve") ||
		can("reports:billing");
	const canSeeReports = canSeeClaimReports && can("reports:beta");

	const availability = {} as Record<HeaderItemId, boolean>;
	for (const def of HEADER_ITEM_DEFS) {
		if (def.id === "report-dashboard") {
			availability[def.id] = canSeeEvalReportDashboard;
		} else if (def.id === "claim-reports") {
			availability[def.id] = canSeeClaimReports;
		} else if (def.id === "reports") {
			availability[def.id] = canSeeReports;
		} else {
			const permission = ITEM_PERMISSIONS[def.id];
			availability[def.id] = permission ? can(permission) : true;
		}
	}
	return availability;
}

function groupByCategory(items: HeaderItemDef[]) {
	const groups = new Map<HeaderItemCategory | "General", HeaderItemDef[]>();
	for (const item of items) {
		const key = item.category ?? "General";
		const arr = groups.get(key) ?? [];
		arr.push(item);
		groups.set(key, arr);
	}
	return groups;
}

function HeaderItemRow({
	def,
	desktopChecked,
	mobileChecked,
	onToggle,
	onToggleName,
}: {
	def: HeaderItemDef;
	desktopChecked: boolean;
	mobileChecked: boolean;
	onToggle: (surface: "desktop" | "mobile", visible: boolean) => void;
	onToggleName: () => void;
}) {
	const desktopId = `header-item-desktop-${def.id}`;
	const mobileId = `header-item-mobile-${def.id}`;

	return (
		<div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
			<button
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
				onClick={onToggleName}
				type="button"
			>
				<def.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{def.label}</span>
			</button>
			<div className={`flex shrink-0 justify-center ${CHECKBOX_COLUMN_WIDTH}`}>
				{def.surfaces.includes("desktop") && (
					<Checkbox
						checked={desktopChecked}
						id={desktopId}
						onCheckedChange={(value) => onToggle("desktop", value === true)}
					/>
				)}
			</div>
			<div className={`flex shrink-0 justify-center ${CHECKBOX_COLUMN_WIDTH}`}>
				{def.surfaces.includes("mobile") && (
					<Checkbox
						checked={mobileChecked}
						id={mobileId}
						onCheckedChange={(value) => onToggle("mobile", value === true)}
					/>
				)}
			</div>
		</div>
	);
}

export function HeaderItemsCustomizer() {
	const utils = api.useUtils();
	const { data: prefs, isLoading } = api.users.getHeaderPreferences.useQuery();
	const updatePrefs = api.users.updateHeaderPreferences.useMutation({
		onMutate: async (variables) => {
			// Cancel any in-flight fetch (e.g. the one triggered when this
			// popover just mounted) so it can't land after our optimistic
			// write and revert the checkbox back to the old value.
			await utils.users.getHeaderPreferences.cancel();
			const previous = utils.users.getHeaderPreferences.getData();
			utils.users.getHeaderPreferences.setData(undefined, (old) => ({
				desktop: old?.desktop ?? [],
				mobile: old?.mobile ?? [],
				[variables.surface]: variables.hiddenItems,
			}));
			return { previous };
		},
		onError: (_err, _variables, context) => {
			if (context?.previous) {
				utils.users.getHeaderPreferences.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.users.getHeaderPreferences.invalidate();
		},
	});
	const availability = useItemAvailability();

	const desktopHidden = new Set(prefs?.desktop ?? []);
	const mobileHidden = new Set(prefs?.mobile ?? []);

	const toggle = (
		surface: "desktop" | "mobile",
		id: HeaderItemId,
		visible: boolean,
	) => {
		const current = new Set(
			surface === "desktop" ? desktopHidden : mobileHidden,
		);
		if (visible) {
			current.delete(id);
		} else {
			current.add(id);
		}
		updatePrefs.mutate({ surface, hiddenItems: Array.from(current) });
	};

	const toggleName = async (def: HeaderItemDef) => {
		const currentlyVisibleEverywhere = def.surfaces.every(
			(surface) =>
				!(surface === "desktop" ? desktopHidden : mobileHidden).has(def.id),
		);
		const nextVisible = !currentlyVisibleEverywhere;

		const nextBySurface: Partial<Record<"desktop" | "mobile", string[]>> = {};
		for (const surface of def.surfaces) {
			const current = new Set(
				surface === "desktop" ? desktopHidden : mobileHidden,
			);
			if (nextVisible) {
				current.delete(def.id);
			} else {
				current.add(def.id);
			}
			nextBySurface[surface] = Array.from(current);
		}

		// Update both checkboxes immediately, so the mobile one doesn't wait
		// on the desktop mutation's full round trip before it moves.
		utils.users.getHeaderPreferences.setData(undefined, (old) => ({
			desktop: nextBySurface.desktop ?? old?.desktop ?? [],
			mobile: nextBySurface.mobile ?? old?.mobile ?? [],
		}));

		// The writes themselves stay sequential: the server stores both
		// surfaces in one blob, so a concurrent second write could still
		// read the pre-first-write copy and clobber it.
		for (const surface of def.surfaces) {
			const hiddenItems = nextBySurface[surface];
			if (!hiddenItems) continue;
			await updatePrefs.mutateAsync({ surface, hiddenItems });
		}
	};

	const items = HEADER_ITEM_DEFS.filter((def) => availability[def.id]);
	const navGroups = groupByCategory(
		items.filter((item) => item.area === "nav"),
	);
	const actionItems = items.filter((item) => item.area === "action");

	return (
		<>
			<PopoverHeader>
				<PopoverTitle>Customize Header</PopoverTitle>
				<PopoverDescription>
					Choose which items appear in your header bar. This only controls what
					you see, not what you have permission to see.
				</PopoverDescription>
			</PopoverHeader>
			{!isLoading && (
				<>
					<div className="flex items-center gap-2 px-2">
						<div className="min-w-0 flex-1" />
						<p
							className={`text-center font-medium text-muted-foreground text-xs uppercase tracking-wide ${CHECKBOX_COLUMN_WIDTH}`}
						>
							Desktop
						</p>
						<p
							className={`text-center font-medium text-muted-foreground text-xs uppercase tracking-wide ${CHECKBOX_COLUMN_WIDTH}`}
						>
							Mobile
						</p>
					</div>
					{GROUP_ORDER.filter((group) => navGroups.has(group)).map((group) => (
						<div key={group}>
							<p className="mb-1 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{group}
							</p>
							<div className="flex flex-col">
								{navGroups.get(group)?.map((def) => (
									<HeaderItemRow
										def={def}
										desktopChecked={!desktopHidden.has(def.id)}
										key={def.id}
										mobileChecked={!mobileHidden.has(def.id)}
										onToggle={(surface, visible) =>
											toggle(surface, def.id, visible)
										}
										onToggleName={() => toggleName(def)}
									/>
								))}
							</div>
						</div>
					))}
					{actionItems.length > 0 && (
						<div>
							<p className="mb-1 px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Actions
							</p>
							<div className="flex flex-col">
								{actionItems.map((def) => (
									<HeaderItemRow
										def={def}
										desktopChecked={!desktopHidden.has(def.id)}
										key={def.id}
										mobileChecked={!mobileHidden.has(def.id)}
										onToggle={(surface, visible) =>
											toggle(surface, def.id, visible)
										}
										onToggleName={() => toggleName(def)}
									/>
								))}
							</div>
						</div>
					)}
				</>
			)}
		</>
	);
}
