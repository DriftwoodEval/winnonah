import { HomePageContent } from "@components/home/HomePageContent";
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
				<div className="flex h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden">
					<HomePageContent />
				</div>
			</HydrateClient>
		</Guard>
	);
}
