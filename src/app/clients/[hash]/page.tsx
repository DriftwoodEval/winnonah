import { Client } from "@components/client/Client";
import { Suspense } from "react";
import { Guard } from "~/app/_components/layout/Guard";
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

	log.info({ user: session?.user.email, hash }, "Viewing client");

	return (
		<Guard>
			<div className="my-4 flex grow justify-center">
				<Suspense>
					<Client hash={hash} />
				</Suspense>
			</div>
		</Guard>
	);
}
