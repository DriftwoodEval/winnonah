import { Guard } from "@components/layout/Guard";
import SchedulingDisplay from "@components/scheduling/SchedulingDisplay";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Scheduling",
};

export default async function SchedulingPage() {
	return (
		<Guard permission="pages:scheduling">
			<Suspense>
				<SchedulingDisplay />
			</Suspense>
		</Guard>
	);
}
