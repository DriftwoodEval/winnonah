import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatAppointmentInfoBlock } from "~/lib/appointment-info-block";
import { checkInternalApiAuth } from "~/server/auth/internal-api";
import { getClientInfoData } from "~/server/client-info";

const QuerySchema = z.object({
	id: z.string().regex(/^\d+$/).optional(),
	title: z.string().min(1),
	start: z.coerce.date(),
	includePhone: z
		.enum(["true", "false"])
		.optional()
		.transform((v) => v === "true"),
});

/**
 * Builds the same per-appointment text block the client page's copy button
 * produces, for the appointment-agenda Google Apps Script to send in its
 * weekly digest email. The script owns the calendar, so it supplies the
 * event title and start time; this endpoint owns the client-record lookup
 * and the location/type/notes formatting, so the two never drift apart.
 */
export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const rawId = searchParams.get("id");
	const requestedClientId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

	const auth = await checkInternalApiAuth(
		req,
		"internal.appointmentBlock",
		requestedClientId,
	);
	if (!auth.ok) {
		return NextResponse.json(
			{ error: "Unauthorized" },
			{ status: auth.status },
		);
	}

	const validation = QuerySchema.safeParse({
		id: rawId ?? undefined,
		title: searchParams.get("title"),
		start: searchParams.get("start"),
		includePhone: searchParams.get("includePhone") ?? undefined,
	});

	if (!validation.success) {
		return NextResponse.json(
			{ error: "Invalid query parameters" },
			{ status: 400 },
		);
	}

	const { id, title, start, includePhone } = validation.data;

	try {
		const client = id ? await getClientInfoData(Number(id)) : null;

		const block = formatAppointmentInfoBlock({
			title,
			startTime: start,
			includePhone,
			client,
		});

		return NextResponse.json({ block });
	} catch (error) {
		console.error("Database query failed:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
