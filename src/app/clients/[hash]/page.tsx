import { Client } from "@components/client/Client";
import { AuthRejection } from "@components/layout/AuthRejection";
import { logger } from "~/lib/logger";
import { auth } from "~/server/auth";

const log = logger.child({ module: "ClientPage" });

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

	log.info({ user: session.user.email, hash }, "Viewing client");

	return (
		<div className="mx-4 flex flex-grow items-center justify-center">
			<Client hash={hash} />
		</div>
	);
}
