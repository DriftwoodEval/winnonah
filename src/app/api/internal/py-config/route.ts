import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { checkInternalApiAuth } from "~/server/auth/internal-api";
import { db } from "~/server/db";
import { pythonConfig } from "~/server/db/schema";

export async function GET(req: NextRequest) {
	const auth = await checkInternalApiAuth(req);
	if (!auth.ok) {
		return new NextResponse("Unauthorized", { status: auth.status });
	}

	const record = await db.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, 1),
	});

	if (!record) {
		return NextResponse.json({ error: "Config not found" }, { status: 404 });
	}

	return NextResponse.json(record.data);
}
