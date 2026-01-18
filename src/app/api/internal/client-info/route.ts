import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import { clients } from "~/server/db/schema";

const QuerySchema = z.object({ id: z.string().min(1) });

export async function GET(req: NextRequest) {
	const authHeader = req.headers.get("authorization");
	if (authHeader !== `Bearer ${process.env.API_KEY}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(req.url);
	const rawId = searchParams.get("id");

	const validation = QuerySchema.safeParse({ id: rawId });

	if (!validation.success) {
		return NextResponse.json(
			{ error: "Invalid ID parameter" },
			{ status: 400 },
		);
	}

	const clientId = parseInt(validation.data.id, 10);

	try {
		const client = await db.query.clients.findFirst({
			where: eq(clients.id, clientId),
			columns: {
				fullName: true,
			},
		});

		if (!client) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		return NextResponse.json({ fullName: client.fullName });
	} catch (error) {
		console.error("Database query failed:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
