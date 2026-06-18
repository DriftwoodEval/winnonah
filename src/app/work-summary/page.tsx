import { Guard } from "@components/layout/Guard";
import WorkSummary from "@components/work-summary/WorkSummary";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Work Summary",
};

export default async function Page() {
	return (
		<Guard permission="pages:work-summary">
			<div className="flex grow flex-col items-center justify-start gap-4 px-4 py-6">
				<WorkSummary />
			</div>
		</Guard>
	);
}
