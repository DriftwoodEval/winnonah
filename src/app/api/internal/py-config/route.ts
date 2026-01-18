import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { pythonConfig } from "~/server/db/schema";

const API_KEY = process.env.API_KEY;

export async function GET(req: NextRequest) {
	const authHeader = req.headers.get("authorization");
	if (authHeader !== `Bearer ${API_KEY}`) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const record = await db.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, 1),
	});

	if (!record) {
		return NextResponse.json({ error: "Config not found" }, { status: 404 });
	}

	return NextResponse.json(record.data);
}
