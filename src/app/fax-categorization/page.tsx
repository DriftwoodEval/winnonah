import { FaxCategorizationGrid } from "@components/fax-categorization/FaxCategorizationGrid";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Fax Categorization",
};

export default async function Page() {
	return (
		<Guard permission="fax:categorization:review">
			<div className="mx-4 my-6 flex w-full min-w-0 flex-col gap-6 sm:mx-10 sm:my-10">
				<h1 className="font-bold text-2xl">Fax Categorization</h1>
				<FaxCategorizationGrid />
			</div>
		</Guard>
	);
}
