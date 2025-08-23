import { Client } from "@components/client/Client";
import { auth } from "~/server/auth";

export default async function Page({
	params,
}: {
	params: Promise<{ hash: string }>;
}) {
	const session = await auth();
	const parameters = await params;
	const hash = parameters.hash;

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
		<div className="mx-4 flex flex-grow items-center justify-center">
			<Client hash={hash} />
		</div>
	);
}
