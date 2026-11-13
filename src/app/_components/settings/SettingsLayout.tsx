"use client";

import AppointmentsSyncSettings from "@components/settings/AppointmentsSyncSettings";
import AssessmentTypesTable from "@components/settings/AssessmentTypesTable";
import AuditLogTable from "@components/settings/AuditLogTable";
import BabynetReportSettings from "@components/settings/BabynetReportSettings";
import EiContactsSettings from "@components/settings/EiContactsSettings";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import IssueReportSettings from "@components/settings/IssueReportSettings";
import MyPreferencesSettings from "@components/settings/MyPreferencesSettings";
import OfficesSettings from "@components/settings/OfficesSettings";
import PeopleTable from "@components/settings/PeopleTable";
import PostVisitAttachmentSettings from "@components/settings/PostVisitAttachmentSettings";
import QuestionnaireRemindersSettings from "@components/settings/QuestionnaireRemindersSettings";
import QuestionnaireRulesTable from "@components/settings/QuestionnaireRulesTable";
import RolesTable from "@components/settings/RolesTable";
import RunLogsTable from "@components/settings/RunLogsTable";
import WorkSummaryDefaultsSection from "@components/settings/WorkSummaryDefaultsSection";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import { Kbd } from "@ui/kbd";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BillingDownload from "~/app/_components/settings/BillingDownload";
import { QSuiteTab } from "~/app/_components/settings/QSuiteTab";
import ReportQueueSettings from "~/app/_components/settings/ReportQueueSettings";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	DEFAULT_SETTINGS_PAGE,
	getVisibleSettingsGroups,
	legacyTabToPage,
	type SettingsPageId,
} from "~/lib/settings/pages";
import { cn } from "~/lib/utils";
import ReminderSettings from "./RemindersSettings";

type VisibleGroups = ReturnType<typeof getVisibleSettingsGroups>;

function SettingsSearch({
	groups,
	onNavigate,
}: {
	groups: VisibleGroups;
	onNavigate: (id: SettingsPageId) => void;
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
				className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-xs"
				onClick={() => setOpen(true)}
				type="button"
			>
				<Search className="h-4 w-4" />
				Search settings...
				<Kbd>/</Kbd>
			</button>
			<CommandDialog
				description="Search settings"
				onOpenChange={setOpen}
				open={open}
				title="Search settings"
			>
				<Command>
					<CommandInput placeholder="Search settings..." />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						{groups.map(({ group, pages }) => (
							<CommandGroup heading={group.label} key={group.id}>
								{pages.map((page) => (
									<CommandItem
										key={page.id}
										onSelect={() => {
											setOpen(false);
											onNavigate(page.id);
										}}
										value={`${page.label} ${page.description} ${page.keywords} ${group.label}`}
									>
										<page.icon />
										{page.label}
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}

function SettingsPageBody({ id }: { id: SettingsPageId }) {
	switch (id) {
		case "preferences":
			return <MyPreferencesSettings />;
		case "people":
			return (
				<div className="flex flex-col gap-8">
					<PeopleTable />
					<InvitesTable />
				</div>
			);
		case "roles":
			return <RolesTable />;
		case "ei-contacts":
			return <EiContactsSettings />;
		case "offices":
			return <OfficesSettings />;
		case "insurances":
			return <InsurancesTable />;
		case "assessments":
			return (
				<div className="flex flex-col gap-8">
					<AssessmentTypesTable />
					<QuestionnaireRulesTable />
				</div>
			);
		case "appointment-durations":
			return <WorkSummaryDefaultsSection />;
		case "report-queue":
			return <ReportQueueSettings />;
		case "appointment-sync":
			return <AppointmentsSyncSettings />;
		case "appointment-reminders":
			return <ReminderSettings />;
		case "questionnaire-reminders":
			return <QuestionnaireRemindersSettings />;
		case "post-visit-message":
			return <PostVisitAttachmentSettings />;
		case "issue-reports":
			return <IssueReportSettings />;
		case "qsuite-general":
			return <QSuiteTab section="general" />;
		case "qsuite-services":
			return <QSuiteTab section="services" />;
		case "qsuite-records":
			return <QSuiteTab section="records" />;
		case "qsuite-piecework":
			return <QSuiteTab section="piecework" />;
		case "downloads":
			return <BillingDownload />;
		case "run-logs":
			return <RunLogsTable />;
		case "audit-log":
			return <AuditLogTable />;
		case "babynet-report":
			return <BabynetReportSettings />;
	}
}

export function SettingsLayout() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const can = useCheckPermission();

	const groups = getVisibleSettingsGroups(can);
	const visiblePages = groups.flatMap((entry) => entry.pages);

	// Links from the old tab layout (`?tab=...`) land on the matching page.
	const pageParam = searchParams.get("page");
	const legacyPage = pageParam ? undefined : legacyTabToPage(searchParams);
	const requested = pageParam ?? legacyPage;
	const current =
		visiblePages.find((page) => page.id === requested) ??
		visiblePages.find((page) => page.id === DEFAULT_SETTINGS_PAGE) ??
		visiblePages[0];

	const hrefFor = (id: SettingsPageId) => `${pathname}?page=${id}`;

	useEffect(() => {
		if (legacyPage) router.replace(`${pathname}?page=${legacyPage}`);
	}, [legacyPage, pathname, router]);

	const goTo = (id: SettingsPageId) => router.push(hrefFor(id));

	if (!current) return null;

	return (
		<div className="mx-4 my-6 flex w-full min-w-0 flex-col gap-6 sm:mx-10 sm:my-10">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Settings</h1>
				<SettingsSearch groups={groups} onNavigate={goTo} />
			</div>

			<div className="md:hidden">
				<Select
					onValueChange={(value) => goTo(value as SettingsPageId)}
					value={current.id}
				>
					<SelectTrigger aria-label="Settings page" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{groups.map(({ group, pages }) => (
							<SelectGroup key={group.id}>
								<SelectLabel>{group.label}</SelectLabel>
								{pages.map((page) => (
									<SelectItem key={page.id} value={page.id}>
										{page.label}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex min-w-0 gap-10">
				<nav
					aria-label="Settings"
					className="hidden w-56 shrink-0 flex-col gap-5 self-start md:sticky md:top-14 md:flex"
				>
					{groups.map(({ group, pages }) => (
						<div className="flex flex-col gap-0.5" key={group.id}>
							<span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
								{group.label}
							</span>
							{pages.map((page) => {
								const isCurrent = page.id === current.id;
								return (
									<Link
										aria-current={isCurrent ? "page" : undefined}
										className={cn(
											"flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
											isCurrent
												? "bg-muted font-medium text-foreground"
												: "text-foreground/70",
										)}
										href={hrefFor(page.id)}
										key={page.id}
									>
										<page.icon className="size-4 shrink-0" />
										{page.label}
									</Link>
								);
							})}
						</div>
					))}
				</nav>

				<div className="min-w-0 flex-1 md:border-l md:pl-10">
					<div className="flex flex-col gap-1 pb-6">
						<h2 className="text-xl font-semibold">{current.label}</h2>
						<p className="max-w-prose text-sm text-muted-foreground">
							{current.description}
						</p>
					</div>
					<SettingsPageBody id={current.id} />
				</div>
			</div>
		</div>
	);
}
