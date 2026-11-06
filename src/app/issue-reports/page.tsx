import { IssueReportList } from "@components/issue-report/IssueReportList";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "My Bug Reports",
};

export default function Page() {
	return (
		<Guard>
			<div className="mx-4 my-6 flex w-full flex-col gap-6 sm:mx-10 sm:my-10">
				<IssueReportList />
			</div>
		</Guard>
	);
}
