import { fromZonedTime } from "date-fns-tz";
import mysql from "mysql2/promise";
import { env } from "~/env";
import { BUSINESS_TIMEZONE } from "~/lib/constants";

// Enabling the reports feature (plus the one-off punch-list backfill) created a
// report row for nearly every evaluation in history. This prints a breakdown of
// every open (non-archived) report against the tracking cutoff, then deletes the
// clear noise: reports whose most recent qualifying eval is before the cutoff
// (or whose eval has since been cancelled/rescheduled away), that nobody has
// claimed and that are not yet approved.
//
// Kept no matter what: archived rows, approved rows (billing history), and any
// row with a writer assigned. Those are reported so a follow-up pass can decide.
//
// Dry run by default. Pass --execute to actually delete.

const EXECUTE = process.argv.includes("--execute");
const CUTOFF_BUSINESS_DATE = "2026-08-01";

type Row = {
	id: number;
	source: string;
	status: string;
	writerUserId: string | null;
	lastEvalAt: Date | null;
};

function pad(s: string | number, n: number) {
	return String(s).padEnd(n);
}

async function run() {
	const cutoffDate = fromZonedTime(
		`${CUTOFF_BUSINESS_DATE}T00:00:00`,
		BUSINESS_TIMEZONE,
	);
	const cutoffMs = cutoffDate.getTime();
	console.log(
		`Report cleanup${EXECUTE ? "" : " [DRY RUN]"} - cutoff ${CUTOFF_BUSINESS_DATE} business\n`,
	);

	const connection = await mysql.createConnection(env.DATABASE_URL);

	const [rows] = (await connection.query(`
		SELECT
			r.id, r.source, r.status, r.writerUserId,
			(
				SELECT MAX(a.startTime)
				FROM emr_appointment a
				WHERE a.clientId = r.clientId
				  AND (
					a.daEval IN ('EVAL', 'DAEVAL')
					OR (a.daEval = 'DA' AND a.asdAdhd = 'ADHD')
				  )
				  AND a.cancelled = 0 AND a.rescheduled = 0
				  AND a.placeholder = 0 AND a.billingOnly = 0
			) AS lastEvalAt
		FROM emr_report r
		WHERE r.archivedAt IS NULL
	`)) as [Row[], unknown];

	const evalBucket = (r: Row) =>
		r.lastEvalAt === null
			? "no eval"
			: new Date(r.lastEvalAt).getTime() < cutoffMs
				? "pre-cutoff"
				: "current";

	// Breakdown: status x eval bucket.
	const matrix = new Map<string, Map<string, number>>();
	for (const r of rows) {
		const byBucket = matrix.get(r.status) ?? new Map<string, number>();
		byBucket.set(evalBucket(r), (byBucket.get(evalBucket(r)) ?? 0) + 1);
		matrix.set(r.status, byBucket);
	}
	console.log(`${rows.length} open reports total\n`);
	console.log(
		`${pad("status", 12)}${pad("pre-cutoff", 12)}${pad("current", 10)}no eval`,
	);
	for (const [status, byBucket] of matrix) {
		console.log(
			`${pad(status, 12)}${pad(byBucket.get("pre-cutoff") ?? 0, 12)}` +
				`${pad(byBucket.get("current") ?? 0, 10)}${byBucket.get("no eval") ?? 0}`,
		);
	}

	// Delete set: not approved, no writer, eval pre-cutoff or gone.
	const toDelete: number[] = [];
	const keptForReview = { approvedPreCutoff: 0, assignedPreCutoff: 0 };
	for (const r of rows) {
		const stale = evalBucket(r) !== "current";
		if (!stale) continue;
		if (r.status === "approved") {
			keptForReview.approvedPreCutoff++;
			continue;
		}
		if (r.writerUserId !== null) {
			keptForReview.assignedPreCutoff++;
			continue;
		}
		toDelete.push(r.id);
	}

	console.log(`\nDelete (stale, unassigned, not approved): ${toDelete.length}`);
	console.log(
		`Kept for review - approved but pre-cutoff:  ${keptForReview.approvedPreCutoff}`,
	);
	console.log(
		`Kept for review - assigned but pre-cutoff:  ${keptForReview.assignedPreCutoff}`,
	);

	if (toDelete.length === 0) {
		console.log("\nNothing to delete.");
		await connection.end();
		return;
	}

	if (!EXECUTE) {
		console.log("\nRe-run with --execute to delete.");
		await connection.end();
		return;
	}

	// Chunk the delete so a very large IN list stays under limits.
	let deleted = 0;
	for (let i = 0; i < toDelete.length; i += 500) {
		const chunk = toDelete.slice(i, i + 500);
		const [res] = (await connection.query(
			"DELETE FROM emr_report WHERE id IN (?)",
			[chunk],
		)) as [mysql.ResultSetHeader, unknown];
		deleted += res.affectedRows;
	}
	console.log(`\nDeleted ${deleted} report row(s).`);

	await connection.end();
}

run().catch((err) => {
	console.error("Cleanup failed:", err);
	process.exit(1);
});
