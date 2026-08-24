import { and, desc, eq, gte, like, lte, sql } from "drizzle-orm";
import z from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { auditLogs, clients, users } from "~/server/db/schema";

const filterSchema = z.object({
	userId: z.string().optional(),
	clientId: z.number().optional(),
	action: z.string().optional(),
	from: z.date().optional(),
	to: z.date().optional(),
	limit: z.number().min(1).max(200).default(50),
	offset: z.number().min(0).default(0),
});

function buildWhere(input: z.infer<typeof filterSchema>) {
	const conditions = [
		input.userId ? eq(auditLogs.userId, input.userId) : undefined,
		input.clientId ? eq(auditLogs.clientId, input.clientId) : undefined,
		input.action ? like(auditLogs.action, `%${input.action}%`) : undefined,
		input.from ? gte(auditLogs.createdAt, input.from) : undefined,
		input.to ? lte(auditLogs.createdAt, input.to) : undefined,
	].filter((c): c is NonNullable<typeof c> => c !== undefined);
	return conditions.length > 0 ? and(...conditions) : undefined;
}

export const auditLogRouter = createTRPCRouter({
	list: protectedProcedure.input(filterSchema).query(async ({ ctx, input }) => {
		assertPermission(ctx.session.user, "settings:audit-log:view");

		const where = buildWhere(input);

		const [rows, countRows] = await Promise.all([
			ctx.db
				.select({
					id: auditLogs.id,
					createdAt: auditLogs.createdAt,
					userId: auditLogs.userId,
					userEmail: auditLogs.userEmail,
					impersonatedBy: auditLogs.impersonatedBy,
					action: auditLogs.action,
					clientId: auditLogs.clientId,
					input: auditLogs.input,
					success: auditLogs.success,
					errorMessage: auditLogs.errorMessage,
					userName: users.name,
					clientFirstName: clients.firstName,
					clientLastName: clients.lastName,
					clientHash: clients.hash,
				})
				.from(auditLogs)
				.leftJoin(users, eq(auditLogs.userId, users.id))
				.leftJoin(clients, eq(auditLogs.clientId, clients.id))
				.where(where)
				.orderBy(desc(auditLogs.createdAt))
				.limit(input.limit)
				.offset(input.offset),
			ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(auditLogs)
				.where(where),
		]);

		return { rows, total: countRows[0]?.count ?? 0 };
	}),

	getActionNames: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:audit-log:view");

		const rows = await ctx.db
			.selectDistinct({ action: auditLogs.action })
			.from(auditLogs)
			.orderBy(auditLogs.action);

		return rows.map((r) => r.action);
	}),
});
