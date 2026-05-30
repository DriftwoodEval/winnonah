import { ClientsDashboard } from "@components/clients/ClientsDashboard";
import type { Metadata } from "next";
import { env } from "~/env";
import { HydrateClient } from "~/trpc/server";
import { Guard } from "./_components/layout/Guard";

export const metadata: Metadata = {
	title: `Clients | ${env.NEXT_PUBLIC_APP_TITLE}`,
};

export default async function Home() {
	return (
		<Guard>
			<HydrateClient>
				<div className="mx-4 flex h-[calc(100dvh-2.5rem)] grow flex-col overflow-hidden pt-4">
					<ClientsDashboard />
				</div>
			</HydrateClient>
		</Guard>
	);
}
