import {
	BookOpen,
	Bug,
	Calculator,
	Calendar1,
	CalendarDays,
	CalendarPlus,
	CalendarRange,
	ClipboardClock,
	Clock,
	Eye,
	FileText,
	Home,
	KeyRound,
	LayoutDashboard,
	LayoutGrid,
	LineChart,
	ListTodo,
	type LucideIcon,
	MessageSquareWarning,
	PhoneCall,
	Search,
	Sun,
	Users,
	VenetianMask,
	Wrench,
} from "lucide-react";

export type HeaderItemId =
	| "home"
	| "directory"
	| "dashboard"
	| "day-ahead"
	| "greeter-schedule"
	| "availability"
	| "scheduling"
	| "scheduling-helper"
	| "claim-reports"
	| "reports"
	| "report-dashboard"
	| "fax-categorization"
	| "work-summary"
	| "calculator"
	| "questionnaire-logins"
	| "docs"
	| "search"
	| "recent-clients"
	| "issues-alert"
	| "task-queue"
	| "impersonate"
	| "redaction-toggle"
	| "theme-switcher"
	| "issue-form";

/** The nav dropdown groups, in display order. */
export const HEADER_NAV_CATEGORIES = [
	{ label: "Clients", icon: Users },
	{ label: "Schedule", icon: CalendarDays },
	{ label: "Reports", icon: FileText },
	{ label: "Tools", icon: Wrench },
] as const;

export type HeaderItemCategory =
	(typeof HEADER_NAV_CATEGORIES)[number]["label"];

export type HeaderItemSurface = "desktop" | "mobile";

type HeaderItemBase = {
	id: HeaderItemId;
	label: string;
	icon: LucideIcon;
	surfaces: HeaderItemSurface[];
};

export type HeaderNavItemDef = HeaderItemBase & {
	area: "nav";
	href: string;
	category?: HeaderItemCategory;
};

export type HeaderActionItemDef = HeaderItemBase & { area: "action" };

export type HeaderItemDef = HeaderNavItemDef | HeaderActionItemDef;

export function isNavItemDef(def: HeaderItemDef): def is HeaderNavItemDef {
	return def.area === "nav";
}

const BOTH_SURFACES: HeaderItemSurface[] = ["desktop", "mobile"];

export const HEADER_ITEM_DEFS: HeaderItemDef[] = [
	{
		id: "home",
		label: "Home",
		icon: Home,
		area: "nav",
		href: "/",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "dashboard",
		label: "Dashboard",
		icon: LayoutDashboard,
		area: "nav",
		href: "/dashboard",
		category: "Clients",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "directory",
		label: "Directory",
		icon: Users,
		area: "nav",
		href: "/clients/directory",
		category: "Clients",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "day-ahead",
		label: "Day Ahead",
		icon: Calendar1,
		area: "nav",
		href: "/day-ahead",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "availability",
		label: "Availability",
		icon: Clock,
		area: "nav",
		href: "/availability",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "scheduling",
		label: "Scheduling",
		icon: CalendarRange,
		area: "nav",
		href: "/scheduling",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "greeter-schedule",
		label: "Greeter Schedule",
		icon: PhoneCall,
		area: "nav",
		href: "/greeter-schedule",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "scheduling-helper",
		label: "Scheduling Helper (Beta)",
		icon: CalendarPlus,
		area: "nav",
		href: "/scheduling/helper",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "claim-reports",
		label: "Claim Reports",
		icon: FileText,
		area: "nav",
		href: "/claim-reports",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "reports",
		label: "Reports (Beta)",
		icon: FileText,
		area: "nav",
		href: "/reports",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "report-dashboard",
		label: "Report Dashboard",
		icon: LineChart,
		area: "nav",
		href: "/evaluator-dashboard",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "fax-categorization",
		label: "Fax Categorization",
		icon: LayoutGrid,
		area: "nav",
		href: "/fax-categorization",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "work-summary",
		label: "Work Summary",
		icon: ClipboardClock,
		area: "nav",
		href: "/work-summary",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "calculator",
		label: "Calculator",
		icon: Calculator,
		area: "nav",
		href: "/calculator",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "questionnaire-logins",
		label: "Questionnaire Logins",
		icon: KeyRound,
		area: "nav",
		href: "/questionnaire-logins",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "docs",
		label: "Docs",
		icon: BookOpen,
		area: "nav",
		href: "/docs",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "search",
		label: "Client Search",
		icon: Search,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "recent-clients",
		label: "Recent Clients",
		icon: Clock,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "issues-alert",
		label: "Issues Alert",
		icon: MessageSquareWarning,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "task-queue",
		label: "Task Queue",
		icon: ListTodo,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "impersonate",
		label: "Acting As",
		icon: VenetianMask,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "redaction-toggle",
		label: "PII Redaction Toggle",
		icon: Eye,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "theme-switcher",
		label: "Theme Switcher",
		icon: Sun,
		area: "action",
		surfaces: ["desktop"],
	},
	{
		id: "issue-form",
		label: "Report an Issue",
		icon: Bug,
		area: "action",
		surfaces: BOTH_SURFACES,
	},
];
