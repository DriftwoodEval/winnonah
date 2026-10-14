"use client";

import AppointmentsSyncSettings from "@components/settings/AppointmentsSyncSettings";
import AssessmentTypesTable from "@components/settings/AssessmentTypesTable";
import AuditLogTable from "@components/settings/AuditLogTable";
import BabynetReportSettings from "@components/settings/BabynetReportSettings";
import EiContactsSettings from "@components/settings/EiContactsSettings";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import PeopleTable from "@components/settings/PeopleTable";
import QuestionnaireRemindersSettings from "@components/settings/QuestionnaireRemindersSettings";
import QuestionnaireRulesTable from "@components/settings/QuestionnaireRulesTable";
import RolesTable from "@components/settings/RolesTable";
import WorkSummaryDefaultsSection from "@components/settings/WorkSummaryDefaultsSection";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from "@ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BillingDownload from "~/app/_components/settings/BillingDownload";
import { QSuiteTab } from "~/app/_components/settings/QSuiteTab";
import ReportQueueSettings from "~/app/_components/settings/ReportQueueSettings";
import { useCheckPermission } from "~/hooks/use-check-permission";
import ReminderSettings from "./RemindersSettings";

/** Reads/writes a tab value to a URL search param, defaulting when absent. */
function useUrlTab(paramName: string, defaultValue: string) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const urlValue = searchParams.get(paramName) ?? defaultValue;
	const [value, setValue] = useState(urlValue);

	useEffect(() => {
		setValue(urlValue);
	}, [urlValue]);

	const onChange = (next: string) => {
		setValue(next);
		const params = new URLSearchParams(searchParams.toString());
		params.set(paramName, next);
		router.push(`${pathname}?${params.toString()}`);
	};

	return [value, onChange] as const;
}

interface SearchEntry {
	label: string;
	keywords: string;
	tab: string;
	subParam?: string;
	subValue?: string;
}

const SEARCH_ENTRIES: SearchEntry[] = [
	{
		label: "Staff",
		keywords: "people staff accounts",
		tab: "people",
		subParam: "peopleSubTab",
		subValue: "staff",
	},
	{
		label: "Pending Invites",
		keywords: "people staff invitations",
		tab: "people",
		subParam: "peopleSubTab",
		subValue: "staff",
	},
	{
		label: "Roles",
		keywords: "roles permissions access control",
		tab: "people",
		subParam: "peopleSubTab",
		subValue: "roles",
	},
	{
		label: "EI Contacts",
		keywords: "people ei contacts early intervention directory",
		tab: "people",
		subParam: "peopleSubTab",
		subValue: "ei-contacts",
	},
	{
		label: "Insurances",
		keywords: "clinical insurance payers",
		tab: "clinical",
		subParam: "clinicalTab",
		subValue: "insurances",
	},
	{
		label: "Assessment Types & Rules",
		keywords: "clinical assessment battery questionnaire rules",
		tab: "clinical",
		subParam: "clinicalTab",
		subValue: "assessments",
	},
	{
		label: "Questionnaire Reminders",
		keywords: "clinical questionnaire reminders cadence messages",
		tab: "clinical",
		subParam: "clinicalTab",
		subValue: "reminders",
	},
	{
		label: "Report Queue",
		keywords: "clinical reports review queue",
		tab: "clinical",
		subParam: "clinicalTab",
		subValue: "report-queue",
	},
	{
		label: "Appointment Sync",
		keywords: "scheduling appointments sync",
		tab: "scheduling",
		subParam: "schedulingTab",
		subValue: "sync",
	},
	{
		label: "Reminder Scripts & Quiet Time",
		keywords: "scheduling reminders quiet time office phrases scripts",
		tab: "scheduling",
		subParam: "schedulingTab",
		subValue: "reminders",
	},
	{
		label: "Default Appointment Durations",
		keywords: "scheduling appointment durations diagnosis",
		tab: "scheduling",
		subParam: "schedulingTab",
		subValue: "durations",
	},
	{
		label: "QSuite General",
		keywords: "qsuite general",
		tab: "qsuite",
		subParam: "qsuiteTab",
		subValue: "general",
	},
	{
		label: "QSuite Services",
		keywords: "qsuite services",
		tab: "qsuite",
		subParam: "qsuiteTab",
		subValue: "services",
	},
	{
		label: "QSuite Records",
		keywords: "qsuite records",
		tab: "qsuite",
		subParam: "qsuiteTab",
		subValue: "records",
	},
	{
		label: "QSuite Piecework",
		keywords: "qsuite piecework",
		tab: "qsuite",
		subParam: "qsuiteTab",
		subValue: "piecework",
	},
	{ label: "Downloads", keywords: "billing downloads", tab: "downloads" },
	{ label: "Audit Log", keywords: "audit log history", tab: "audit-log" },
	{
		label: "BabyNet Report",
		keywords: "babynet weekly report",
		tab: "babynet-report",
	},
];

function SettingsSearch({
	onNavigate,
}: {
	onNavigate: (entry: SearchEntry) => void;
}) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;

			if (e.key === "/" && !isTyping) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<>
			<button
				className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-muted-foreground text-sm shadow-xs"
				onClick={() => setOpen(true)}
				type="button"
			>
				<Search className="h-4 w-4" />
				Search settings...
				<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
					/
				</kbd>
			</button>
			<CommandDialog
				description="Search settings"
				onOpenChange={setOpen}
				open={open}
				title="Search settings"
			>
				<Command>
					<CommandInput placeholder="Search settings..." />
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup>
						{SEARCH_ENTRIES.map((entry) => (
							<CommandItem
								key={entry.label}
								onSelect={() => {
									setOpen(false);
									onNavigate(entry);
								}}
								value={`${entry.label} ${entry.keywords}`}
							>
								{entry.label}
							</CommandItem>
						))}
					</CommandGroup>
				</Command>
			</CommandDialog>
		</>
	);
}

export function SettingsTabs() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const can = useCheckPermission();

	const urlTab = searchParams.get("tab") ?? "people";
	const [activeTab, setActiveTab] = useState(urlTab);

	useEffect(() => {
		setActiveTab(urlTab);
	}, [urlTab]);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const [peopleSubTab, setPeopleSubTab] = useUrlTab("peopleSubTab", "staff");
	const [clinicalTab, setClinicalTab] = useUrlTab("clinicalTab", "insurances");
	const [schedulingTab, setSchedulingTab] = useUrlTab("schedulingTab", "sync");

	const canDownload = can("clients:download");
	const canQSuite =
		can("settings:qsuite:general") ||
		can("settings:qsuite:services") ||
		can("settings:qsuite:records") ||
		can("settings:qsuite:piecework");
	const canViewAuditLog = can("settings:audit-log:view");
	const canViewBabynetReport = can("settings:babynet-report:view");

	const goToSearchEntry = (entry: SearchEntry) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", entry.tab);
		if (entry.subParam && entry.subValue) {
			params.set(entry.subParam, entry.subValue);
		}
		setActiveTab(entry.tab);
		if (entry.subParam === "peopleSubTab" && entry.subValue) {
			setPeopleSubTab(entry.subValue);
		}
		if (entry.subParam === "clinicalTab" && entry.subValue) {
			setClinicalTab(entry.subValue);
		}
		if (entry.subParam === "schedulingTab" && entry.subValue) {
			setSchedulingTab(entry.subValue);
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<div className="mx-4 my-6 flex w-full min-w-0 flex-col gap-6 sm:mx-10 sm:my-10">
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-bold text-2xl">Settings</h1>
				<SettingsSearch onNavigate={goToSearchEntry} />
			</div>
			<Tabs onValueChange={handleTabChange} value={activeTab}>
				<TabsList className="!h-auto flex-wrap justify-start gap-1">
					<TabsTrigger className="h-8 grow-0" value="people">
						People
					</TabsTrigger>
					<TabsTrigger className="h-8 grow-0" value="clinical">
						Clinical
					</TabsTrigger>
					<TabsTrigger className="h-8 grow-0" value="scheduling">
						Scheduling
					</TabsTrigger>
					{canQSuite && (
						<TabsTrigger className="h-8 grow-0" value="qsuite">
							QSuite
						</TabsTrigger>
					)}
					{canDownload && (
						<TabsTrigger className="h-8 grow-0" value="downloads">
							Downloads
						</TabsTrigger>
					)}
					{canViewAuditLog && (
						<TabsTrigger className="h-8 grow-0" value="audit-log">
							Audit Log
						</TabsTrigger>
					)}
					{canViewBabynetReport && (
						<TabsTrigger className="h-8 grow-0" value="babynet-report">
							BabyNet Report
						</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="people">
					<Tabs onValueChange={setPeopleSubTab} value={peopleSubTab}>
						<TabsList className="!h-auto flex-wrap justify-start gap-1">
							<TabsTrigger className="h-8 grow-0" value="staff">
								Staff
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="roles">
								Roles
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="ei-contacts">
								EI Contacts
							</TabsTrigger>
						</TabsList>
						<TabsContent value="staff">
							<div className="flex flex-col gap-8">
								<PeopleTable />
								<InvitesTable />
							</div>
						</TabsContent>
						<TabsContent value="roles">
							<RolesTable />
						</TabsContent>
						<TabsContent value="ei-contacts">
							<EiContactsSettings />
						</TabsContent>
					</Tabs>
				</TabsContent>
				<TabsContent value="clinical">
					<Tabs onValueChange={setClinicalTab} value={clinicalTab}>
						<TabsList className="!h-auto flex-wrap justify-start gap-1">
							<TabsTrigger className="h-8 grow-0" value="insurances">
								Insurances
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="assessments">
								Assessments
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="reminders">
								Reminders
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="report-queue">
								Report Queue
							</TabsTrigger>
						</TabsList>
						<TabsContent value="insurances">
							<InsurancesTable />
						</TabsContent>
						<TabsContent value="assessments">
							<div className="flex flex-col gap-8">
								<AssessmentTypesTable />
								<QuestionnaireRulesTable />
							</div>
						</TabsContent>
						<TabsContent value="reminders">
							<QuestionnaireRemindersSettings />
						</TabsContent>
						<TabsContent value="report-queue">
							<ReportQueueSettings />
						</TabsContent>
					</Tabs>
				</TabsContent>
				<TabsContent value="scheduling">
					<Tabs onValueChange={setSchedulingTab} value={schedulingTab}>
						<TabsList className="!h-auto flex-wrap justify-start gap-1">
							<TabsTrigger className="h-8 grow-0" value="sync">
								Sync
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="reminders">
								Reminders
							</TabsTrigger>
							<TabsTrigger className="h-8 grow-0" value="durations">
								Appointment Durations
							</TabsTrigger>
						</TabsList>
						<TabsContent value="sync">
							<AppointmentsSyncSettings />
						</TabsContent>
						<TabsContent value="reminders">
							<ReminderSettings />
						</TabsContent>
						<TabsContent value="durations">
							<WorkSummaryDefaultsSection />
						</TabsContent>
					</Tabs>
				</TabsContent>
				{canQSuite && (
					<TabsContent value="qsuite">
						<QSuiteTab />
					</TabsContent>
				)}
				{canDownload && (
					<TabsContent value="downloads">
						<BillingDownload />
					</TabsContent>
				)}
				{canViewAuditLog && (
					<TabsContent value="audit-log">
						<AuditLogTable />
					</TabsContent>
				)}
				{canViewBabynetReport && (
					<TabsContent value="babynet-report">
						<BabynetReportSettings />
					</TabsContent>
				)}
			</Tabs>
		</div>
	);
}
