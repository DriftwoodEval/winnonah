import { AuthRejection } from "@components/layout/AuthRejection";
import EvaluatorsTable from "@components/settings/EvaluatorsTable";
import InsurancesTable from "@components/settings/InsurancesTable";
import InvitesTable from "@components/settings/InvitesTable";
import UsersTable from "@components/settings/UsersTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { auth } from "~/server/auth";

export default async function Settings() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return (
		<div className="mx-10 my-10 flex w-full flex-col gap-6">
			<h1 className="font-bold text-2xl">Settings</h1>
			<Tabs defaultValue="users">
				<TabsList className="w-full sm:w-1/2">
					<TabsTrigger value="users">Users</TabsTrigger>
					<TabsTrigger value="evaluators">Evaluators</TabsTrigger>
					<TabsTrigger value="insurances">Insurances</TabsTrigger>
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
			</Tabs>
		</div>
	);
}
