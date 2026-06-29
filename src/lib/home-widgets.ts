import type { PermissionId } from "./types";

export type WidgetCategory = "clients" | "schedule" | "issues";

export type WidgetSizing = "fill" | "content";

export type HomeWidgetDef = {
	id: string;
	label: string;
	permission: PermissionId | null;
	category: WidgetCategory;
	sizing: WidgetSizing;
};

export const WIDGET_CATEGORY_LABELS: Record<WidgetCategory, string> = {
	clients: "Client Search",
	schedule: "Schedule",
	issues: "Issues",
};

export const HOME_WIDGET_DEFS: HomeWidgetDef[] = [
	{
		id: "clients",
		label: "Client Search",
		permission: null,
		category: "clients",
		sizing: "fill",
	},
	{
		id: "day-ahead-mine",
		label: "My Day",
		permission: null,
		category: "schedule",
		sizing: "content",
	},
	{
		id: "day-ahead-offices",
		label: "Who's In",
		permission: null,
		category: "schedule",
		sizing: "content",
	},
	{
		id: "dd4",
		label: "In DD4",
		permission: "issues:dd4",
		category: "issues",
		sizing: "content",
	},
	{
		id: "just-added",
		label: "Just Added Questionnaires",
		permission: "issues:just-added",
		category: "issues",
		sizing: "content",
	},
	{
		id: "paused-clients",
		label: "Paused Clients",
		permission: "issues:paused-clients",
		category: "issues",
		sizing: "content",
	},
	{
		id: "evaluation-in-process",
		label: "Evaluation In Process",
		permission: "issues:evaluation-in-process",
		category: "issues",
		sizing: "content",
	},
	{
		id: "missing-appointments",
		label: "Appointments to be Created",
		permission: "issues:missing-appointments",
		category: "issues",
		sizing: "content",
	},
	{
		id: "autism-stops",
		label: "Autism Stops",
		permission: "issues:autism-stops",
		category: "issues",
		sizing: "content",
	},
	{
		id: "clients-not-in-db",
		label: "Punchlist Clients Not In DB",
		permission: "issues:clients-not-in-db",
		category: "issues",
		sizing: "content",
	},
	{
		id: "punchlist-inactive",
		label: "Punchlist Clients Inactive",
		permission: "issues:punchlist-inactive",
		category: "issues",
		sizing: "content",
	},
	{
		id: "punchlist-duplicates",
		label: "Duplicate Punchlist IDs",
		permission: "issues:punchlist-duplicates",
		category: "issues",
		sizing: "content",
	},
	{
		id: "no-referral-source",
		label: "No Referral Source",
		permission: "issues:no-referral-source",
		category: "issues",
		sizing: "content",
	},
	{
		id: "missing-districts",
		label: "Missing Districts",
		permission: "issues:district-issues",
		category: "issues",
		sizing: "content",
	},
	{
		id: "poor-address-lookup",
		label: "Poor Address Lookup",
		permission: "issues:district-issues",
		category: "issues",
		sizing: "content",
	},
	{
		id: "babynet-ageout",
		label: "Too Old for BabyNet",
		permission: "issues:babynet-ageout",
		category: "issues",
		sizing: "content",
	},
	{
		id: "not-in-ta",
		label: "Not in TA",
		permission: "issues:not-in-ta",
		category: "issues",
		sizing: "content",
	},
	{
		id: "droplist",
		label: "Drop List",
		permission: "issues:droplist",
		category: "issues",
		sizing: "content",
	},
	{
		id: "babynet-er",
		label: "Needs BabyNet ER Downloaded",
		permission: "issues:babynet-er",
		category: "issues",
		sizing: "content",
	},
	{
		id: "notes-only",
		label: "Notes Only",
		permission: "clients:merge",
		category: "issues",
		sizing: "content",
	},
	{
		id: "no-drive-ids",
		label: "No Drive IDs",
		permission: "issues:no-drive-ids",
		category: "issues",
		sizing: "content",
	},
	{
		id: "private-pay",
		label: "Potential Private Pay",
		permission: "issues:private-pay",
		category: "issues",
		sizing: "content",
	},
	{
		id: "missing-records-needed",
		label: "Records Needed Not Set",
		permission: "issues:missing-records-needed",
		category: "issues",
		sizing: "content",
	},
	{
		id: "unreviewed-records",
		label: "Unreviewed/Unreceived Records",
		permission: "issues:unreviewed-records",
		category: "issues",
		sizing: "content",
	},
	{
		id: "duplicate-drive",
		label: "Duplicate Drive Folders",
		permission: "issues:duplicate-drive",
		category: "issues",
		sizing: "content",
	},
	{
		id: "duplicate-q-links",
		label: "Clients with Duplicate Q Links",
		permission: "issues:duplicate-questionnaires",
		category: "issues",
		sizing: "content",
	},
	{
		id: "clients-sharing-q",
		label: "Clients Sharing Questionnaires",
		permission: "issues:duplicate-questionnaires",
		category: "issues",
		sizing: "content",
	},
	{
		id: "duplicate-names",
		label: "Duplicate Client Names",
		permission: "issues:duplicate-names",
		category: "issues",
		sizing: "content",
	},
];

export type WidgetConfig = {
	id: string;
	cols: number;
	rows: number;
};

export const DEFAULT_WIDGET_CONFIG: Record<
	string,
	{ cols: number; rows: number }
> = {
	clients: { cols: 4, rows: 3 },
	"day-ahead-mine": { cols: 2, rows: 2 },
	"day-ahead-offices": { cols: 2, rows: 2 },
	default: { cols: 1, rows: 2 },
};

export function getWidgetDefaults(id: string): { cols: number; rows: number } {
	return DEFAULT_WIDGET_CONFIG[id] ?? { cols: 1, rows: 2 };
}

export function getWidgetSizing(id: string): WidgetSizing {
	return HOME_WIDGET_DEFS.find((d) => d.id === id)?.sizing ?? "content";
}

export const DEFAULT_HOME_WIDGETS: WidgetConfig[] = [
	{ id: "clients", cols: 4, rows: 3 },
];
