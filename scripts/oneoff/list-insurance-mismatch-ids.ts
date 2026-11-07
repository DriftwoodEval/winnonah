// Prints the client IDs on the "Insurance Doesn't Match" issue list as one
// comma-separated line (IDs only, no names), ready to pass to the Medicaid
// recheck:
//   cd python && uv run python -m cron.main --medicaid --client "$(cd .. && pnpm exec tsx scripts/oneoff/list-insurance-mismatch-ids.ts)"
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "~/env";
import { getInsuranceMismatchList } from "~/lib/issues/issue-lists";
import * as schema from "~/server/db/schema";

async function run() {
	const connection = await mysql.createConnection(env.DATABASE_URL);
	const db = drizzle(connection, { schema, mode: "default" });

	const mismatches = await getInsuranceMismatchList(db as never);
	console.log(mismatches.map((c) => c.id).join(","));

	await connection.end();
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
