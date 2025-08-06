import { ClientsDashboard } from "@components/clients/ClientsDashboard";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
	const session = await auth();

	return (
		<HydrateClient>
			<main className="flex min-h-screen flex-col items-center justify-center">
				<div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
					{session?.user && <ClientsDashboard />}
				</div>
			</main>
		</HydrateClient>
	);
}
