import { IssuesList } from "@components/issues/issuesList";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Issues",
};

export default async function Page() {
	return (
		<Guard>
			<div className="mx-4 my-6 flex w-full min-w-0 flex-col gap-6 sm:mx-10 sm:my-10">
				<IssuesList />
			</div>
		</Guard>
	);
}
