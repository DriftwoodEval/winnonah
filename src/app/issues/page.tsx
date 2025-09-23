import { IssuesList } from "@components/issues/issuesList";
import { AuthRejection } from "@components/layout/AuthRejection";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return <AuthRejection />;
	}

	return (
		<div className="mx-10 my-10 flex w-full flex-col gap-6">
			<IssuesList />
		</div>
	);
}
