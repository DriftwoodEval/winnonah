import {
	Activity,
	Baby,
	Banknote,
	BellRing,
	Building2,
	ClipboardCheck,
	ClipboardList,
	Clock,
	Download,
	Flag,
	FolderInput,
	Handshake,
	History,
	IdCard,
	Inbox,
	KeyRound,
	type LucideIcon,
	Mail,
	RefreshCw,
	Settings,
	Settings2,
	ShieldCheck,
	Users,
} from "lucide-react";
import type { PermissionId } from "~/lib/types";

export type SettingsGroupId =
	| "personal"
	| "people"
	| "practice"
	| "messages"
	| "qsuite"
	| "reports-logs";

export type SettingsPageId =
	| "preferences"
	| "people"
	| "roles"
	| "ei-contacts"
	| "offices"
	| "insurances"
	| "assessments"
	| "appointment-durations"
	| "report-queue"
	| "appointment-sync"
	| "appointment-reminders"
	| "questionnaire-reminders"
	| "post-visit-message"
	| "issue-reports"
	| "qsuite-general"
	| "qsuite-services"
	| "qsuite-records"
	| "qsuite-piecework"
	| "downloads"
	| "run-logs"
	| "audit-log"
	| "babynet-report";

export interface SettingsGroupDef {
	id: SettingsGroupId;
	label: string;
}

export interface SettingsPageDef {
	id: SettingsPageId;
	label: string;
	description: string;
	icon: LucideIcon;
	group: SettingsGroupId;
	/** Pages without a permission are open to everyone; edit controls inside them are gated separately. */
	permission: PermissionId | null;
	/** Extra words the settings search matches, for things on the page the title does not name. */
	keywords: string;
}

export const SETTINGS_GROUPS: SettingsGroupDef[] = [
	{ id: "personal", label: "Personal" },
	{ id: "people", label: "People" },
	{ id: "practice", label: "Practice" },
	{ id: "messages", label: "Messages & Reports" },
	{ id: "qsuite", label: "QSuite" },
	{ id: "reports-logs", label: "Reports & Logs" },
];

export const DEFAULT_SETTINGS_PAGE: SettingsPageId = "preferences";

export const SETTINGS_PAGES: SettingsPageDef[] = [
	{
		id: "preferences",
		label: "Preferences",
		description: "Hover card, header, home page, and issue list order.",
		icon: Settings2,
		group: "personal",
		permission: null,
		keywords:
			"my preferences customize header navigation hide show home page widgets layout client hover tooltip card info fields issues lists reorder theme",
	},
	{
		id: "people",
		label: "People",
		description: "Evaluators, accounts, and pending invites.",
		icon: Users,
		group: "people",
		permission: null,
		keywords: "staff evaluators accounts invites invitations archived",
	},
	{
		id: "roles",
		label: "Roles",
		description: "Roles and the permissions each one grants.",
		icon: ShieldCheck,
		group: "people",
		permission: null,
		keywords: "permissions access control",
	},
	{
		id: "ei-contacts",
		label: "EI Contacts",
		description: "Early Intervention coordinators shared across clients.",
		icon: Handshake,
		group: "people",
		permission: null,
		keywords: "early intervention directory coordinators phone",
	},
	{
		id: "offices",
		label: "Offices",
		description: "Addresses and the location phrase used in messages.",
		icon: Building2,
		group: "practice",
		permission: null,
		keywords: "locations address archive closest office",
	},
	{
		id: "appointment-durations",
		label: "Appointment Durations",
		description:
			"Default hours per appointment type when an evaluator has none set.",
		icon: Clock,
		group: "practice",
		permission: null,
		keywords: "scheduling diagnosis default",
	},
	{
		id: "appointment-sync",
		label: "Appointment Sync",
		description: "Trusted and ignored appointment IDs.",
		icon: RefreshCw,
		group: "practice",
		permission: null,
		keywords: "scheduling appointments sync google calendar import",
	},
	{
		id: "assessments",
		label: "Assessments",
		description: "Assessment types and the battery rules.",
		icon: ClipboardList,
		group: "practice",
		permission: null,
		keywords: "questionnaire battery rules online in-person types",
	},
	{
		id: "report-queue",
		label: "Report Queue",
		description: "Default claim limit and review labels.",
		icon: Inbox,
		group: "practice",
		permission: "reports:approve",
		keywords: "reports review claimed max",
	},
	{
		id: "insurances",
		label: "Insurances",
		description:
			"Short names, official names, pre-auth, lock in, and appointments required.",
		icon: IdCard,
		group: "practice",
		permission: null,
		keywords: "payers aliases pre-auth provider lock in units",
	},
	{
		id: "appointment-reminders",
		label: "Appointment Reminders",
		description: "Quiet time, reminder scripts, and recent activity.",
		icon: BellRing,
		group: "messages",
		permission: null,
		keywords:
			"scheduling quiet time scripts templates replies confirmation history",
	},
	{
		id: "questionnaire-reminders",
		label: "Questionnaire Reminders",
		description: "Cadence and the message for each reminder stage.",
		icon: ClipboardCheck,
		group: "messages",
		permission: null,
		keywords: "clinical cadence messages escalation",
	},
	{
		id: "post-visit-message",
		label: "Post-Visit Message",
		description: "Message text and PDF attachment.",
		icon: Mail,
		group: "messages",
		permission: "settings:post-visit-attachment:edit",
		keywords: "post visit message attachment pdf",
	},
	{
		id: "issue-reports",
		label: "Issue Reports",
		description: "People staff can copy on an issue report.",
		icon: Flag,
		group: "messages",
		permission: "settings:issue-report:edit",
		keywords: "issue report bug email recipients cc",
	},
	{
		id: "qsuite-general",
		label: "General",
		description: "Sender identity, emails, and system IDs.",
		icon: Settings,
		group: "qsuite",
		permission: "settings:qsuite:general",
		keywords: "qsuite identity initials sender punch list payroll database",
	},
	{
		id: "qsuite-services",
		label: "Services",
		description: "Logins and keys for each outside service.",
		icon: KeyRound,
		group: "qsuite",
		permission: "settings:qsuite:services",
		keywords:
			"qsuite therapyappointment medicaid mhs qglobal wps novopsych kimai quo logins",
	},
	{
		id: "qsuite-records",
		label: "Records",
		description: "Records folders and the emails map.",
		icon: FolderInput,
		group: "qsuite",
		permission: "settings:qsuite:records",
		keywords: "qsuite records emails map fax folders",
	},
	{
		id: "qsuite-piecework",
		label: "Piecework",
		description: "Costs, ADHD-only report billing, and staff.",
		icon: Banknote,
		group: "qsuite",
		permission: "settings:qsuite:piecework",
		keywords: "qsuite piecework costs billing payroll",
	},
	{
		id: "downloads",
		label: "Downloads",
		description: "CSV exports, last script run times, and the run summary.",
		icon: Download,
		group: "reports-logs",
		permission: "clients:download",
		keywords: "billing csv export script run times summary",
	},
	{
		id: "babynet-report",
		label: "BabyNet Weekly Report",
		description: "Weekly client counts and amounts.",
		icon: Baby,
		group: "reports-logs",
		permission: "settings:babynet-report:view",
		keywords: "babynet weekly report",
	},
	{
		id: "run-logs",
		label: "Run Logs",
		description: "Script runs and their log lines.",
		icon: Activity,
		group: "reports-logs",
		permission: "settings:run-logs:view",
		keywords: "qsend qreceive records scripts errors",
	},
	{
		id: "audit-log",
		label: "Audit Log",
		description: "Who changed what, and when.",
		icon: History,
		group: "reports-logs",
		permission: "settings:audit-log:view",
		keywords: "history changes",
	},
];

/** The pages a user can open, grouped in display order. Empty groups are dropped. */
export function getVisibleSettingsGroups(can: (id: PermissionId) => boolean) {
	return SETTINGS_GROUPS.map((group) => ({
		group,
		pages: SETTINGS_PAGES.filter(
			(page) =>
				page.group === group.id && (!page.permission || can(page.permission)),
		),
	})).filter((entry) => entry.pages.length > 0);
}
