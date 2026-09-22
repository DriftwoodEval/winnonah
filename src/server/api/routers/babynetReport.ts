import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { babynetReports } from "~/server/db/schema";

function assertBabynetReportAccess(perms: PermissionsObject) {
	if (!hasPermission(perms, "settings:babynet-report:view")) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have permission to view the BabyNet report",
		});
	}
}

export const babynetReportRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		assertBabynetReportAccess(ctx.session.user.permissions);

		return ctx.db.query.babynetReports.findMany({
			orderBy: desc(babynetReports.weekOf),
		});
	}),
});
