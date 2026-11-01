import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { PERMISSION_GROUP_IDS, type PermissionId } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { checkInternalApiAuth } from "~/server/auth/internal-api";
import { mergePermissions } from "~/server/auth/permissions";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

/**
 * Active users who hold a permission, counting their role and their own
 * overrides. Lets the Python side pick notification recipients without
 * repeating the permission rules. `email` narrows the result to one user.
 */
export async function GET(req: NextRequest) {
	const auth = await checkInternalApiAuth(
		req,
		"internal.usersWithPermission",
		null,
		false,
	);
	if (!auth.ok) {
		return new NextResponse("Unauthorized", { status: auth.status });
	}

	const permission = req.nextUrl.searchParams.get("permission");
	if (!permission || !(permission in PERMISSION_GROUP_IDS)) {
		return NextResponse.json({ error: "Unknown permission" }, { status: 400 });
	}
	const email = req.nextUrl.searchParams.get("email");

	const activeUsers = await db.query.users.findMany({
		where: eq(users.archived, false),
		with: { role: true },
	});

	const holders = activeUsers
		.filter((user) => !email || user.email === email)
		.filter((user) =>
			hasPermission(
				mergePermissions(user.permissions, user.role?.permissions),
				permission as PermissionId,
			),
		)
		.map((user) => ({
			email: user.email,
			name: user.name,
			claimedReportFolder: user.claimedReportFolder,
			blockedEvaluatorNpis: user.blockedEvaluatorNpis,
		}));

	return NextResponse.json(holders);
}
