import { FaxCategorizationGrid } from "@components/fax-categorization/FaxCategorizationGrid";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Fax Categorization",
};

export default async function Page() {
	return (
		<Guard permission="fax:categorization:review">
			<div className="mx-10 my-10 flex w-full flex-col gap-6">
				<h1 className="font-bold text-2xl">Fax Categorization</h1>
				<FaxCategorizationGrid />
			</div>
		</Guard>
	);
}
