import { Client } from "~/app/_components/client";

export default async function Page({
	params,
}: { params: Promise<{ hash: string }> }) {
	const parameters = await params;
	const hash = parameters.hash;
	return (
		<main className="grid h-full place-content-center overflow-auto">
			<Client hash={hash} />
		</main>
	);
}
