import { IssuesList } from "@components/issues/issuesList";

export default async function Page() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center">
			<IssuesList />
		</main>
	);
}
