import { Guard } from "@components/layout/Guard";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportsView } from "~/app/_components/reports/ReportsView";
import { canAccessReportsBeta } from "~/lib/utils";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

export const metadata: Metadata = {
	title: "Reports",
};

export const dynamic = "force-dynamic";

export default async function Page() {
	const session = await auth();
	if (session?.user) {
		const user = await db.query.users.findFirst({
			where: eq(users.id, session.user.id),
			columns: { maxClaimedReports: true },
		});
		if (
			!canAccessReportsBeta({
				permissions: session.user.permissions,
				maxClaimedReports: user?.maxClaimedReports,
			})
		) {
			redirect("/");
		}
	}

	return (
		<Guard>
			<div className="flex grow flex-col gap-4 px-4 py-6">
				<ReportsView />
			</div>
		</Guard>
	);
}
