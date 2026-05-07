"use client";

import AppointmentsSyncSettings from "@components/settings/AppointmentsSyncSettings";
import AssessmentTypesTable from "@components/settings/AssessmentTypesTable";
import EvaluatorsTable from "@components/settings/EvaluatorsTable";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import QuestionnaireRulesTable from "@components/settings/QuestionnaireRulesTable";
import UsersTable from "@components/settings/UsersTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BillingDownload from "~/app/_components/settings/BillingDownload";
import { useCheckPermission } from "~/hooks/use-check-permission";

export function SettingsTabs() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const can = useCheckPermission();

	const activeTab = searchParams.get("tab") ?? "users";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const canDownloadBilling = can("clients:billing:download");

	return (
		<div className="mx-10 my-10 flex w-full flex-col gap-6">
			<h1 className="font-bold text-2xl">Settings</h1>
			<Tabs onValueChange={handleTabChange} value={activeTab}>
				<TabsList className="w-full sm:w-1/2">
					<TabsTrigger value="users">Users</TabsTrigger>
					<TabsTrigger value="evaluators">Evaluators</TabsTrigger>
					<TabsTrigger value="insurances">Insurances</TabsTrigger>
					<TabsTrigger value="assessment-config">Assessment Config</TabsTrigger>
					<TabsTrigger value="appointments-sync">Appointments Sync</TabsTrigger>
					{canDownloadBilling && (
						<TabsTrigger value="downloads">Downloads</TabsTrigger>
					)}
				</TabsList>
				<TabsContent value="users">
					<div className="flex flex-col gap-8">
						<UsersTable />
						<InvitesTable />
					</div>
				</TabsContent>
				<TabsContent value="evaluators">
					<EvaluatorsTable />
				</TabsContent>
				<TabsContent value="insurances">
					<InsurancesTable />
				</TabsContent>
				<TabsContent value="assessment-config">
					<div className="flex flex-col gap-8">
						<AssessmentTypesTable />
						<QuestionnaireRulesTable />
					</div>
				</TabsContent>
				<TabsContent value="appointments-sync">
					<AppointmentsSyncSettings />
				</TabsContent>
				{canDownloadBilling && (
					<TabsContent value="downloads">
						<BillingDownload />
					</TabsContent>
				)}
			</Tabs>
		</div>
	);
}
