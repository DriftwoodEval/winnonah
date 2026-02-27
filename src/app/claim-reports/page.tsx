import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";
import ReportQueue from "~/app/_components/shared/ReportQueue";

export const metadata: Metadata = {
	title: "Claim Reports",
};

export default async function Page() {
	return (
		<Guard>
			<ReportQueue
				destId="1f9lcLMr9UKUEUVGRG5j0yEJkdue4FFnV"
				sourceId="1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s"
			/>
		</Guard>
	);
}
