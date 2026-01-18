import { ClientsDashboard } from "@components/clients/ClientsDashboard";
import { HydrateClient } from "~/trpc/server";
import { Guard } from "./_components/layout/Guard";

export default async function Home() {
	return (
		<Guard>
			<HydrateClient>
				<div className="mx-4 flex grow items-center justify-center">
					<ClientsDashboard />
				</div>
			</HydrateClient>
		</Guard>
	);
}
