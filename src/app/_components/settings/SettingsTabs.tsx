"use client";

import AppointmentsSyncSettings from "@components/settings/AppointmentsSyncSettings";
import AssessmentTypesTable from "@components/settings/AssessmentTypesTable";
import AuditLogTable from "@components/settings/AuditLogTable";
import BabynetReportSettings from "@components/settings/BabynetReportSettings";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import PeopleTable from "@components/settings/PeopleTable";
import QuestionnaireRemindersSettings from "@components/settings/QuestionnaireRemindersSettings";
import QuestionnaireRulesTable from "@components/settings/QuestionnaireRulesTable";
import RolesTable from "@components/settings/RolesTable";
import WorkSummaryDefaultsSection from "@components/settings/WorkSummaryDefaultsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import BillingDownload from "~/app/_components/settings/BillingDownload";
import { QSuiteTab } from "~/app/_components/settings/QSuiteTab";
import ReportQueueSettings from "~/app/_components/settings/ReportQueueSettings";
import { useCheckPermission } from "~/hooks/use-check-permission";
import ReminderSettings from "./RemindersSettings";

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

	const canDownload = can("clients:download");
	const canQSuite =
		can("settings:qsuite:general") ||
		can("settings:qsuite:services") ||
		can("settings:qsuite:records") ||
		can("settings:qsuite:piecework");
	const canViewAuditLog = can("settings:audit-log:view");
	const canViewBabynetReport = can("settings:babynet-report:view");

	return (
		<div className="mx-4 my-6 flex w-full min-w-0 flex-col gap-6 sm:mx-10 sm:my-10">
			<h1 className="font-bold text-2xl">Settings</h1>
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
					<div className="flex flex-col gap-8">
						<PeopleTable />
						<InvitesTable />
						<RolesTable />
						<WorkSummaryDefaultsSection />
						<ReportQueueSettings />
					</div>
				</TabsContent>
				<TabsContent value="clinical">
					<div className="flex flex-col gap-8">
						<InsurancesTable />
						<AssessmentTypesTable />
						<QuestionnaireRulesTable />
						<QuestionnaireRemindersSettings />
					</div>
				</TabsContent>
				<TabsContent value="scheduling">
					<div className="flex flex-col gap-8">
						<AppointmentsSyncSettings />
						<ReminderSettings />
					</div>
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
