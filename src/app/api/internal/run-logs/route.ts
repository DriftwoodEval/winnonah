import { lt, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkInternalApiAuth } from "~/server/auth/internal-api";
import { db } from "~/server/db";
import { scriptRunLogs, scriptRuns } from "~/server/db/schema";

const RETENTION_MONTHS = 6;
const MAX_TEXT_LENGTH = 60_000;

const BatchSchema = z.object({
	runId: z.string().uuid(),
	app: z.string().min(1).max(32),
	lines: z
		.array(
			z.object({
				time: z.string().datetime({ offset: true }),
				level: z.string().max(16),
				source: z.string().max(255),
				message: z.string(),
				exception: z.string().nullish(),
				clientId: z.number().int().nullish(),
			}),
		)
		.min(1)
		.max(1000),
});

/** Deletes runs and log lines older than the retention window. Called when a new run appears. */
async function purgeExpired() {
	const cutoff = new Date();
	cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
	await db.delete(scriptRunLogs).where(lt(scriptRunLogs.time, cutoff));
	await db.delete(scriptRuns).where(lt(scriptRuns.lastLogAt, cutoff));
}

export async function POST(req: NextRequest) {
	const auth = await checkInternalApiAuth(req, "internal.runLogs", null, false);
	if (!auth.ok) {
		return NextResponse.json(
			{ error: "Unauthorized" },
			{ status: auth.status },
		);
	}

	const parsed = BatchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 });
	}
	const { runId, app, lines } = parsed.data;

	const rows = lines.map((line) => ({
		runId,
		clientId: line.clientId ?? null,
		time: new Date(line.time),
		level: line.level,
		source: line.source,
		message: line.message.slice(0, MAX_TEXT_LENGTH),
		exception: line.exception?.slice(0, MAX_TEXT_LENGTH) ?? null,
	}));
	const times = rows.map((r) => r.time.getTime());
	const first = new Date(Math.min(...times));
	const last = new Date(Math.max(...times));

	const [insertResult] = await db
		.insert(scriptRuns)
		.values({ id: runId, app, startedAt: first, lastLogAt: last })
		.onDuplicateKeyUpdate({
			set: {
				lastLogAt: sql`GREATEST(${scriptRuns.lastLogAt}, VALUES(${scriptRuns.lastLogAt}))`,
				startedAt: sql`LEAST(${scriptRuns.startedAt}, VALUES(${scriptRuns.startedAt}))`,
			},
		});
	await db.insert(scriptRunLogs).values(rows);

	// affectedRows is 1 for a fresh insert, 2 when an existing row was updated.
	if (insertResult.affectedRows === 1) {
		await purgeExpired();
	}

	return NextResponse.json({ ok: true });
}
