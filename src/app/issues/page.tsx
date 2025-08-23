import { IssuesList } from "@components/issues/issuesList";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();

	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<h1 className="font-bold text-2xl">
					You must be logged in to view this page.
				</h1>
			</main>
		);
	}

	return (
		<div className="mx-10 my-10 flex w-full flex-col gap-6">
			<IssuesList />
		</div>
	);
}
