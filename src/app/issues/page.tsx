import { IssuesList } from "@components/issues/issuesList";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Issues",
};

export default async function Page() {
	return (
		<Guard>
			<div className="mx-10 my-10 flex w-full flex-col gap-6">
				<IssuesList />
			</div>
		</Guard>
	);
}
