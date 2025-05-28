import { Client } from "~/app/_components/client";

export default async function Page({
	params,
}: { params: Promise<{ hash: string }> }) {
	const parameters = await params;
	const hash = parameters.hash;
	return (
		<main className="flex min-h-screen flex-col items-center justify-center">
			<Client hash={hash} />
		</main>
	);
}
