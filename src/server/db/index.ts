import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";

import { env } from "~/env";
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

export const db = drizzle(conn, { schema, mode: "default" });
