import { Guard } from "@components/layout/Guard";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ClaimedReports from "~/app/_components/shared/ClaimedReports";
import ReportQueue from "~/app/_components/shared/ReportQueue";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export const metadata: Metadata = {
	title: "Claim Reports",
};

export default async function Page() {
	const session = await auth();
	if (session?.user) {
		const user = await db.query.users.findFirst({
			where: eq(users.id, session.user.id),
			columns: { maxClaimedReports: true },
		});
		const canApprove = hasPermission(
			session.user.permissions,
			"reports:approve",
		);
		if (user?.maxClaimedReports === 0 && !canApprove) {
			redirect("/");
		}
	}

	return (
		<Guard>
			<div className="flex grow flex-col items-center justify-center gap-4 px-4">
				<ReportQueue
					destId="1f9lcLMr9UKUEUVGRG5j0yEJkdue4FFnV"
					sourceId="1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s"
				/>
				<ClaimedReports />
			</div>
		</Guard>
	);
}
