"use client";

import AppointmentsSyncSettings from "@components/settings/AppointmentsSyncSettings";
import AssessmentTypesTable from "@components/settings/AssessmentTypesTable";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import PeopleTable from "@components/settings/PeopleTable";
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

	return (
		<div className="mx-10 my-10 flex w-full flex-col gap-6">
			<h1 className="font-bold text-2xl">Settings</h1>
			<Tabs onValueChange={handleTabChange} value={activeTab}>
				<div className="w-fit max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain">
					<TabsList>
						<TabsTrigger value="people">People</TabsTrigger>
						<TabsTrigger value="clinical">Clinical</TabsTrigger>
						<TabsTrigger value="scheduling">Scheduling</TabsTrigger>
						{canQSuite && <TabsTrigger value="qsuite">QSuite</TabsTrigger>}
						{canDownload && (
							<TabsTrigger value="downloads">Downloads</TabsTrigger>
						)}
					</TabsList>
				</div>
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
			</Tabs>
		</div>
	);
}
