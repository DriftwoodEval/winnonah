import EvaluatorsTable from "@components/settings/EvaluatorsTable";
import InvitesTable from "@components/settings/InvitesTable";
import UsersTable from "@components/settings/UsersTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { checkRole } from "~/lib/utils";
import { auth } from "~/server/auth";

export default async function Home() {
	const session = await auth();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<h1 className="font-bold text-2xl">
					You must be logged in to view this page.
				</h1>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen">
			<div className="mx-10 my-10 flex w-full flex-col gap-6">
				<h1 className="font-bold text-2xl">Settings</h1>
				<Tabs defaultValue="users">
					<TabsList className="w-full">
						<TabsTrigger value="users">Users</TabsTrigger>
						<TabsTrigger value="evaluators">Evaluators</TabsTrigger>
					</TabsList>
					<TabsContent value="users">
						<UsersTable />
						<InvitesTable />
					</TabsContent>
					<TabsContent value="evaluators">
						<EvaluatorsTable />
					</TabsContent>
				</Tabs>
			</div>
		</main>
	);
}
