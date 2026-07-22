import type { Metadata } from "next";
import { Suspense } from "react";
import { SchedulingHelper } from "~/app/_components/scheduling-helper/SchedulingHelper";
import { Guard } from "../../_components/layout/Guard";

export const metadata: Metadata = {
	title: "Scheduling Helper",
};

export default async function SchedulingHelperPage() {
	return (
		<Guard permission="pages:scheduling">
			<Suspense>
				<div className="w-full px-5 pt-10">
					<SchedulingHelper />
				</div>
			</Suspense>
		</Guard>
	);
}
