import type { PermissionId } from "./types";

export type WidgetCategory = "clients" | "schedule" | "issues" | "dashboard";

export type WidgetSizing = "fill" | "content";

export type HomeWidgetDef = {
	id: string;
	label: string;
	permission: PermissionId | null;
	category: WidgetCategory;
	sizing: WidgetSizing;
	dashboardSection?: string;
	fixedRows?: true;
	removable?: false;
};

export const WIDGET_CATEGORY_LABELS: Record<WidgetCategory, string> = {
	clients: "Client Search",
	schedule: "Schedule",
	issues: "Issues",
	dashboard: "Dashboard Sections",
};

export const HOME_WIDGET_DEFS: HomeWidgetDef[] = [
	{
		id: "clients",
		label: "Client Search",
		permission: null,
		category: "clients",
		sizing: "fill",
		removable: false,
	},
	{
		id: "recent-clients",
		label: "Recent Clients",
		permission: null,
		category: "clients",
		sizing: "content",
		fixedRows: true,
	},
	{
		id: "my-insurance-clients",
		label: "My Insurance Clients",
		permission: "clients:insurance:review",
		category: "clients",
		sizing: "content",
		fixedRows: true,
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
		id: "cal-day",
		label: "Day Calendar",
		permission: null,
		category: "schedule",
		sizing: "fill",
	},
	{
		id: "cal-3day",
		label: "3-Day Calendar",
		permission: null,
		category: "schedule",
		sizing: "fill",
	},
	{
		id: "cal-week",
		label: "Week Calendar",
		permission: null,
		category: "schedule",
		sizing: "fill",
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
	// Dashboard sections
	{
		id: "ds-active-not-on-punchlist",
		label: "Active and Not On Punchlist",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Active and Not On Punchlist",
	},
	{
		id: "ds-inactive-on-punchlist",
		label: "Inactive and On Punchlist",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Inactive and On Punchlist",
	},
	{
		id: "ds-multiple-filters",
		label: "Clients in Multiple Filters",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Clients in Multiple Filters",
	},
	{
		id: "ds-just-added",
		label: "Just Added/Other",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Just Added/Other",
	},
	{
		id: "ds-needs-outreach",
		label: "Needs Outreach",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Needs Outreach",
	},
	{
		id: "ds-reached-out-needs-review",
		label: "Reached Out - Needs Review",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Reached Out - Needs Review",
	},
	{
		id: "ds-records-status-not-set",
		label: "Records Status Not Set",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Records Status Not Set",
	},
	{
		id: "ds-records-needed-not-requested",
		label: "Records Needed - Not Requested",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Records Needed - Not Requested",
	},
	{
		id: "ds-records-requested-not-returned",
		label: "Records Requested - Not Returned",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Records Requested - Not Returned",
	},
	{
		id: "ds-babynet-eval-needed",
		label: "BabyNet Eval Needed - Not Downloaded",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "BabyNet Eval Needed - Not Downloaded",
	},
	{
		id: "ds-qs-not-determined",
		label: "Qs Not Determined",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Qs Not Determined",
	},
	{
		id: "ds-da-qs-pending",
		label: "DA Qs Pending",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA Qs Pending",
	},
	{
		id: "ds-da-qs-sent",
		label: "DA Qs Sent",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA Qs Sent",
	},
	{
		id: "ds-da-qs-done",
		label: "DA Qs Done",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA Qs Done",
	},
	{
		id: "ds-daeval-qs-pending",
		label: "DA+Eval Qs Pending",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA+Eval Qs Pending",
	},
	{
		id: "ds-eval-qs-pending",
		label: "Eval Qs Pending",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Eval Qs Pending",
	},
	{
		id: "ds-eval-qs-sent",
		label: "Eval Qs Sent",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Eval Qs Sent",
	},
	{
		id: "ds-daeval-qs-sent",
		label: "DA+Eval Qs Sent",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA+Eval Qs Sent",
	},
	{
		id: "ds-eval-qs-done",
		label: "Eval Qs Done",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Eval Qs Done",
	},
	{
		id: "ds-daeval-qs-done",
		label: "DA+Eval Qs Done",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA+Eval Qs Done",
	},
	{
		id: "ds-da-scheduled",
		label: "DA Scheduled",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "DA Scheduled",
	},
	{
		id: "ds-post-da",
		label: "Post-DA",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Post-DA",
	},
	{
		id: "ds-eval-scheduled",
		label: "Eval Scheduled",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Eval Scheduled",
	},
	{
		id: "ds-post-eval",
		label: "Post-Eval",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Post-Eval",
	},
	{
		id: "ds-needs-protocols-scanned",
		label: "Needs Protocols Scanned",
		permission: "pages:dashboard",
		category: "dashboard",
		sizing: "content",
		dashboardSection: "Needs protocols scanned",
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
	"cal-day": { cols: 2, rows: 3 },
	"cal-3day": { cols: 4, rows: 3 },
	"cal-week": { cols: 4, rows: 4 },
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
