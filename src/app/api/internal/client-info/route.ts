import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkInternalApiAuth } from "~/server/auth/internal-api";
import { getClientInfoData } from "~/server/client-info";

const QuerySchema = z.object({ id: z.string().min(1) });

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const rawId = searchParams.get("id");
	const requestedClientId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

	const auth = await checkInternalApiAuth(
		req,
		"internal.clientInfo",
		requestedClientId,
	);
	if (!auth.ok) {
		return NextResponse.json(
			{ error: "Unauthorized" },
			{ status: auth.status },
		);
	}

	const validation = QuerySchema.safeParse({ id: rawId });

	if (!validation.success) {
		return NextResponse.json(
			{ error: "Invalid ID parameter" },
			{ status: 400 },
		);
	}

	const clientId = parseInt(validation.data.id, 10);

	try {
		const clientInfo = await getClientInfoData(clientId);

		if (!clientInfo) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		return NextResponse.json(clientInfo);
	} catch (error) {
		console.error("Database query failed:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
