import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";
import ClaimedReports from "~/app/_components/shared/ClaimedReports";
import ReportQueue from "~/app/_components/shared/ReportQueue";

export const metadata: Metadata = {
	title: "Claim Reports",
};

export default async function Page() {
	return (
		<Guard>
			<div className="flex grow flex-col items-center justify-start gap-4 px-4">
				<ReportQueue
					destId="1f9lcLMr9UKUEUVGRG5j0yEJkdue4FFnV"
					sourceId="1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s"
				/>
				<ClaimedReports />
			</div>
		</Guard>
	);
}
