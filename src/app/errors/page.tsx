import { ErrorsList } from "~/app/_components/errorsList";

export default async function Page() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center">
			<ErrorsList />
		</main>
	);
}
