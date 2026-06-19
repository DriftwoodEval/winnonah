import { sql } from "drizzle-orm";
import { db } from "~/server/db";

export async function GET() {
	try {
		await db.execute(sql`SELECT 1`);
		return Response.json({ status: "ok" }, { status: 200 });
	} catch (error) {
		return Response.json(
			{ status: "error", detail: String(error) },
			{ status: 503 },
		);
	}
}
