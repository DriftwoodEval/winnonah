import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";

import { env } from "~/env";
import { GroupedQueryLogger } from "./query-logger";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
	conn: Pool | undefined;
};

const conn =
	globalForDb.conn ??
	createPool({
		uri: env.DATABASE_URL,
		// Store/read DATETIME columns as literal UTC instants, no driver-side
		// local-timezone conversion.
		timezone: "Z",
		// Return DATE columns as plain "YYYY-MM-DD" strings instead of JS Date
		// objects, since date-only columns have no timezone to convert.
		dateStrings: ["DATE"],
	});
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

// Set DB_QUERY_LOG=true to print queries grouped by statement with repeat
// counts, e.g. to spot N+1 loops.
export const db = drizzle(conn, {
	schema,
	mode: "default",
	logger: env.DB_QUERY_LOG ? new GroupedQueryLogger() : false,
});
