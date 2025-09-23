import { Client } from "@components/client/Client";
import { AuthRejection } from "@components/layout/AuthRejection";
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
		return <AuthRejection />;
	}

	return (
		<div className="mx-4 flex flex-grow items-center justify-center">
			<Client hash={hash} />
		</div>
	);
}
