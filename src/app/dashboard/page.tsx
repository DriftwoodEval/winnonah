import { auth } from "~/server/auth";
import { Dashboard } from "@components/dashboard/Dashboard";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<h1 className="font-bold text-2xl">
					You must be logged in to view this page.
				</h1>
			</main>
		);
	}

	return <Dashboard />;
}
