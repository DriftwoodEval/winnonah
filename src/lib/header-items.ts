import {
	BookOpen,
	Bug,
	Calculator,
	Calendar1,
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
} from "lucide-react";

export type HeaderItemId =
	| "home"
	| "directory"
	| "dashboard"
	| "day-ahead"
	| "greeter-schedule"
	| "availability"
	| "scheduling"
	| "reports"
	| "claim-reports"
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
	| "redaction-toggle"
	| "theme-switcher"
	| "issue-form";

export type HeaderItemCategory = "Clients" | "Schedule" | "Reports" | "Tools";

export type HeaderItemSurface = "desktop" | "mobile";

export type HeaderItemDef = {
	id: HeaderItemId;
	label: string;
	icon: LucideIcon;
	area: "nav" | "action";
	category?: HeaderItemCategory;
	surfaces: HeaderItemSurface[];
};

const BOTH_SURFACES: HeaderItemSurface[] = ["desktop", "mobile"];

export const HEADER_ITEM_DEFS: HeaderItemDef[] = [
	{
		id: "home",
		label: "Home",
		icon: Home,
		area: "nav",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "dashboard",
		label: "Dashboard",
		icon: LayoutDashboard,
		area: "nav",
		category: "Clients",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "directory",
		label: "Directory",
		icon: Users,
		area: "nav",
		category: "Clients",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "day-ahead",
		label: "Day Ahead",
		icon: Calendar1,
		area: "nav",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "greeter-schedule",
		label: "Greeter Schedule",
		icon: PhoneCall,
		area: "nav",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "availability",
		label: "Availability",
		icon: Clock,
		area: "nav",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "scheduling",
		label: "Scheduling",
		icon: CalendarRange,
		area: "nav",
		category: "Schedule",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "reports",
		label: "Reports",
		icon: FileText,
		area: "nav",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "claim-reports",
		label: "Claim Reports",
		icon: FileText,
		area: "nav",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "report-dashboard",
		label: "Report Dashboard",
		icon: LineChart,
		area: "nav",
		category: "Reports",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "fax-categorization",
		label: "Fax Categorization",
		icon: LayoutGrid,
		area: "nav",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "work-summary",
		label: "Work Summary",
		icon: ClipboardClock,
		area: "nav",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "calculator",
		label: "Calculator",
		icon: Calculator,
		area: "nav",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "questionnaire-logins",
		label: "Questionnaire Logins",
		icon: KeyRound,
		area: "nav",
		category: "Tools",
		surfaces: BOTH_SURFACES,
	},
	{
		id: "docs",
		label: "Docs",
		icon: BookOpen,
		area: "nav",
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
