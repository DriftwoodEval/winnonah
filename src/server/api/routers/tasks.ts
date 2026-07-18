import { desc, eq, gte, or } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { tasks } from "~/server/db/schema";

const RECENT_WINDOW_MS = 1000 * 60 * 15;
const POLL_INTERVAL_MS = 3000;

const activeTasksWhere = () =>
	or(
		eq(tasks.status, "running"),
		gte(tasks.startedAt, new Date(Date.now() - RECENT_WINDOW_MS)),
	);

export const taskRouter = createTRPCRouter({
	getActive: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.tasks.findMany({
			where: activeTasksWhere(),
			orderBy: [desc(tasks.startedAt)],
			limit: 50,
		});
	}),

	onTaskUpdate: protectedProcedure.subscription(async function* ({ signal }) {
		let lastSnapshot = "";

		while (!signal?.aborted) {
			const active = await db.query.tasks.findMany({
				where: activeTasksWhere(),
				orderBy: [desc(tasks.startedAt)],
				limit: 50,
			});

			const snapshot = JSON.stringify(active);
			if (snapshot !== lastSnapshot) {
				lastSnapshot = snapshot;
				yield active;
			}

			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}
	}),
});
