import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
import z from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, scriptRunLogs, scriptRuns } from "~/server/db/schema";

const listRunsSchema = z.object({
	app: z.string().optional(),
	/** Only runs that logged at least one line for this client. */
	clientId: z.number().optional(),
	limit: z.number().min(1).max(100).default(25),
	offset: z.number().min(0).default(0),
});

const LEVEL_ORDER = [
	"TRACE",
	"DEBUG",
	"INFO",
	"NOTICE",
	"SUCCESS",
	"WARNING",
	"ERROR",
	"CRITICAL",
] as const;

const listLinesSchema = z.object({
	runId: z.string().uuid(),
	clientId: z.number().optional(),
	/** Show only lines at this level or more severe. */
	minLevel: z.enum(LEVEL_ORDER).default("INFO"),
	limit: z.number().min(1).max(500).default(200),
	offset: z.number().min(0).default(0),
});

export const runLogsRouter = createTRPCRouter({
	listRuns: protectedProcedure
		.input(listRunsSchema)
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:run-logs:view");

			const where = and(
				input.app ? eq(scriptRuns.app, input.app) : undefined,
				input.clientId
					? exists(
							ctx.db
								.select({ one: sql`1` })
								.from(scriptRunLogs)
								.where(
									and(
										eq(scriptRunLogs.runId, scriptRuns.id),
										eq(scriptRunLogs.clientId, input.clientId),
									),
								),
						)
					: undefined,
			);

			const [rows, countRows] = await Promise.all([
				ctx.db
					.select({
						id: scriptRuns.id,
						app: scriptRuns.app,
						startedAt: scriptRuns.startedAt,
						lastLogAt: scriptRuns.lastLogAt,
						errorCount: sql<number>`(select count(*) from ${scriptRunLogs} where ${scriptRunLogs.runId} = ${scriptRuns.id} and ${scriptRunLogs.level} in ('ERROR', 'CRITICAL'))`,
						warningCount: sql<number>`(select count(*) from ${scriptRunLogs} where ${scriptRunLogs.runId} = ${scriptRuns.id} and ${scriptRunLogs.level} = 'WARNING')`,
						clientCount: sql<number>`(select count(distinct ${scriptRunLogs.clientId}) from ${scriptRunLogs} where ${scriptRunLogs.runId} = ${scriptRuns.id})`,
					})
					.from(scriptRuns)
					.where(where)
					.orderBy(desc(scriptRuns.startedAt))
					.limit(input.limit)
					.offset(input.offset),
				ctx.db
					.select({ count: sql<number>`count(*)` })
					.from(scriptRuns)
					.where(where),
			]);

			return { rows, total: countRows[0]?.count ?? 0 };
		}),

	listApps: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:run-logs:view");
		const rows = await ctx.db
			.selectDistinct({ app: scriptRuns.app })
			.from(scriptRuns)
			.orderBy(scriptRuns.app);
		return rows.map((r) => r.app);
	}),

	listLines: protectedProcedure
		.input(listLinesSchema)
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:run-logs:view");

			const levels = LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(input.minLevel));
			const where = and(
				eq(scriptRunLogs.runId, input.runId),
				sql`${scriptRunLogs.level} in (${sql.join(
					levels.map((l) => sql`${l}`),
					sql`, `,
				)})`,
				input.clientId ? eq(scriptRunLogs.clientId, input.clientId) : undefined,
			);

			const [rows, countRows] = await Promise.all([
				ctx.db
					.select({
						id: scriptRunLogs.id,
						time: scriptRunLogs.time,
						level: scriptRunLogs.level,
						source: scriptRunLogs.source,
						message: scriptRunLogs.message,
						exception: scriptRunLogs.exception,
						clientId: scriptRunLogs.clientId,
						clientFirstName: clients.firstName,
						clientLastName: clients.lastName,
						clientHash: clients.hash,
					})
					.from(scriptRunLogs)
					.leftJoin(clients, eq(scriptRunLogs.clientId, clients.id))
					.where(where)
					.orderBy(asc(scriptRunLogs.id))
					.limit(input.limit)
					.offset(input.offset),
				ctx.db
					.select({ count: sql<number>`count(*)` })
					.from(scriptRunLogs)
					.where(where),
			]);

			return { rows, total: countRows[0]?.count ?? 0 };
		}),
});
