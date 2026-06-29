import type { PermissionId } from "./types";

export type HomeWidgetDef = {
	id: string;
	label: string;
	permission: PermissionId | null;
};

export const HOME_WIDGET_DEFS: HomeWidgetDef[] = [
	{ id: "clients", label: "Client Search", permission: null },
	{ id: "dd4", label: "In DD4", permission: "issues:dd4" },
	{
		id: "just-added",
		label: "Just Added Questionnaires",
		permission: "issues:just-added",
	},
	{
		id: "paused-clients",
		label: "Paused Clients",
		permission: "issues:paused-clients",
	},
	{
		id: "evaluation-in-process",
		label: "Evaluation In Process",
		permission: "issues:evaluation-in-process",
	},
	{
		id: "missing-appointments",
		label: "Appointments to be Created",
		permission: "issues:missing-appointments",
	},
	{
		id: "autism-stops",
		label: "Autism Stops",
		permission: "issues:autism-stops",
	},
	{
		id: "clients-not-in-db",
		label: "Punchlist Clients Not In DB",
		permission: "issues:clients-not-in-db",
	},
	{
		id: "punchlist-inactive",
		label: "Punchlist Clients Inactive",
		permission: "issues:punchlist-inactive",
	},
	{
		id: "punchlist-duplicates",
		label: "Duplicate Punchlist IDs",
		permission: "issues:punchlist-duplicates",
	},
	{
		id: "no-referral-source",
		label: "No Referral Source",
		permission: "issues:no-referral-source",
	},
	{
		id: "missing-districts",
		label: "Missing Districts",
		permission: "issues:district-issues",
	},
	{
		id: "poor-address-lookup",
		label: "Poor Address Lookup",
		permission: "issues:district-issues",
	},
	{
		id: "babynet-ageout",
		label: "Too Old for BabyNet",
		permission: "issues:babynet-ageout",
	},
	{ id: "not-in-ta", label: "Not in TA", permission: "issues:not-in-ta" },
	{ id: "droplist", label: "Drop List", permission: "issues:droplist" },
	{
		id: "babynet-er",
		label: "Needs BabyNet ER Downloaded",
		permission: "issues:babynet-er",
	},
	{
		id: "notes-only",
		label: "Notes Only",
		permission: "clients:merge",
	},
	{
		id: "no-drive-ids",
		label: "No Drive IDs",
		permission: "issues:no-drive-ids",
	},
	{
		id: "private-pay",
		label: "Potential Private Pay",
		permission: "issues:private-pay",
	},
	{
		id: "missing-records-needed",
		label: "Records Needed Not Set",
		permission: "issues:missing-records-needed",
	},
	{
		id: "unreviewed-records",
		label: "Unreviewed/Unreceived Records",
		permission: "issues:unreviewed-records",
	},
	{
		id: "duplicate-drive",
		label: "Duplicate Drive Folders",
		permission: "issues:duplicate-drive",
	},
	{
		id: "duplicate-q-links",
		label: "Clients with Duplicate Q Links",
		permission: "issues:duplicate-questionnaires",
	},
	{
		id: "clients-sharing-q",
		label: "Clients Sharing Questionnaires",
		permission: "issues:duplicate-questionnaires",
	},
	{
		id: "duplicate-names",
		label: "Duplicate Client Names",
		permission: "issues:duplicate-names",
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
	default: { cols: 1, rows: 2 },
};

export function getWidgetDefaults(id: string): { cols: number; rows: number } {
	return DEFAULT_WIDGET_CONFIG[id] ?? { cols: 1, rows: 2 };
}

export const DEFAULT_HOME_WIDGETS: WidgetConfig[] = [
	{ id: "clients", cols: 4, rows: 3 },
];
