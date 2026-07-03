import type { Metadata } from "next";
import { Suspense } from "react";
import { env } from "~/env";
import { HydrateClient } from "~/trpc/server";
import { DayAheadContent } from "../_components/day-ahead/DayAheadContent";
import { Guard } from "../_components/layout/Guard";

export const metadata: Metadata = {
	title: `Day Ahead | ${env.NEXT_PUBLIC_APP_TITLE}`,
};

export default async function DayAheadPage() {
	return (
		<Guard>
			<HydrateClient>
				<div className="flex h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden">
					<Suspense>
						<DayAheadContent />
					</Suspense>
				</div>
			</HydrateClient>
		</Guard>
	);
}
