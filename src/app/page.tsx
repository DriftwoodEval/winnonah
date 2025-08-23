import { ClientsDashboard } from "@components/clients/ClientsDashboard";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
	const session = await auth();

	return (
		<HydrateClient>
			<div className="mx-4 flex flex-grow items-center justify-center">
				{session?.user && <ClientsDashboard />}
			</div>
		</HydrateClient>
	);
}
