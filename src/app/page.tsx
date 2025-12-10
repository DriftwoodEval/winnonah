import { ClientsDashboard } from "@components/clients/ClientsDashboard";
import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";

export default async function Home() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return (
		<HydrateClient>
			<div className="mx-4 flex flex-grow items-center justify-center">
				{session?.user && <ClientsDashboard />}
			</div>
		</HydrateClient>
	);
}
