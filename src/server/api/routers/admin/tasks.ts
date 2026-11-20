import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
	createTRPCRouter,
	permissionProcedure,
	protectedProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { tasks } from "~/server/db/schema";

const RECENT_WINDOW_MS = 1000 * 60 * 15;
// Poll quickly while a task is running so progress feels live, and slowly
// otherwise since nothing changes until a new task starts.
const ACTIVE_POLL_INTERVAL_MS = 3000;
const IDLE_POLL_INTERVAL_MS = 15000;

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

/**
 * Marks 'running' rows whose process has died as failed. A live run holds a
 * MySQL named lock on its own row (`task-run:<id>`), and an exclusive run also
 * holds one for its type (`task:<type>`). MySQL frees a named lock as soon as
 * the connection holding it closes, so a running row with both locks free has
 * no process behind it. See `driftwood_common.task_tracker`.
 */
async function failOrphanedTasks(database: typeof db) {
	const orphaned = await database
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			and(
				eq(tasks.status, "running"),
				sql`IS_FREE_LOCK(CONCAT('task:', ${tasks.type})) = 1`,
				sql`IS_FREE_LOCK(CONCAT('task-run:', ${tasks.id})) = 1`,
			),
		);
	if (orphaned.length === 0) return;
	await database
		.update(tasks)
		.set({
			status: "failed",
			completedAt: new Date(),
			error:
				"Orphaned: the process running this task stopped without closing it",
		})
		.where(
			and(
				eq(tasks.status, "running"),
				inArray(
					tasks.id,
					orphaned.map((t) => t.id),
				),
			),
		);
}

async function getActiveTasks(database: typeof db) {
	await failOrphanedTasks(database);
	const active = await database.query.tasks.findMany({
		where: activeTasksWhere(),
		orderBy: [desc(tasks.startedAt)],
		limit: 50,
	});
	return dedupeByType(active);
}

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
	getActive: protectedProcedure.query(({ ctx }) => getActiveTasks(ctx.db)),

	getRunSummaries: permissionProcedure("clients:download").query(
		async ({ ctx }) => {
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
		},
	),

	onTaskUpdate: protectedProcedure.subscription(async function* ({ signal }) {
		let lastSnapshot = "";

		while (!signal?.aborted) {
			const active = await getActiveTasks(db);

			const snapshot = JSON.stringify(active);
			if (snapshot !== lastSnapshot) {
				lastSnapshot = snapshot;
				yield active;
			}

			const anyRunning = active.some((task) => task.status === "running");
			await new Promise((resolve) =>
				setTimeout(
					resolve,
					anyRunning ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS,
				),
			);
		}
	}),
});
