import { desc, eq, gte, inArray, or } from "drizzle-orm";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { tasks } from "~/server/db/schema";

const RECENT_WINDOW_MS = 1000 * 60 * 15;
const POLL_INTERVAL_MS = 3000;

// Task types whose runs produce a `summary` worth showing on the run summary
// section (Downloads settings tab and the home widget).
const RUN_SUMMARY_TYPES = [
	"import_from_ta",
	"questionnaire_send",
	"records_request",
	"evaluator_rematch",
	"appointment_sync",
] as const;

const activeTasksWhere = () =>
	or(
		eq(tasks.status, "running"),
		gte(tasks.startedAt, new Date(Date.now() - RECENT_WINDOW_MS)),
	);

type Task = typeof tasks.$inferSelect;

// Frequently-run task types (e.g. AI fax categorization) would otherwise
// flood the list with repeat entries, so only the most recent of each
// non-running type is kept. Running tasks are always shown.
function dedupeByType(items: Task[]) {
	const seenTypes = new Set<string>();
	const result: Task[] = [];
	for (const task of items) {
		if (task.status === "running") {
			result.push(task);
			continue;
		}
		if (seenTypes.has(task.type)) continue;
		seenTypes.add(task.type);
		result.push(task);
	}
	return result;
}

export const taskRouter = createTRPCRouter({
	getActive: protectedProcedure.query(async ({ ctx }) => {
		const active = await ctx.db.query.tasks.findMany({
			where: activeTasksWhere(),
			orderBy: [desc(tasks.startedAt)],
			limit: 50,
		});
		return dedupeByType(active);
	}),

	getRunSummaries: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "clients:download");

		const recent = await ctx.db.query.tasks.findMany({
			where: inArray(tasks.type, RUN_SUMMARY_TYPES),
			orderBy: [desc(tasks.startedAt)],
			limit: RUN_SUMMARY_TYPES.length * 10,
		});

		const latestByType = new Map<string, Task>();
		for (const task of recent) {
			if (!latestByType.has(task.type)) latestByType.set(task.type, task);
		}

		return RUN_SUMMARY_TYPES.map((type) => ({
			type,
			task: latestByType.get(type) ?? null,
		}));
	}),

	onTaskUpdate: protectedProcedure.subscription(async function* ({ signal }) {
		let lastSnapshot = "";

		while (!signal?.aborted) {
			const active = dedupeByType(
				await db.query.tasks.findMany({
					where: activeTasksWhere(),
					orderBy: [desc(tasks.startedAt)],
					limit: 50,
				}),
			);

			const snapshot = JSON.stringify(active);
			if (snapshot !== lastSnapshot) {
				lastSnapshot = snapshot;
				yield active;
			}

			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}
	}),
});
