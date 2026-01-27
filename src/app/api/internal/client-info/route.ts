import { and, desc, eq, isNotNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NOTE_TEMPLATES } from "~/lib/constants";
import { formatClientAge } from "~/lib/utils";
import { db } from "~/server/db";
import {
	appointments,
	clients,
	evaluators,
	externalRecords,
} from "~/server/db/schema";

const QuerySchema = z.object({ id: z.string().min(1) });

interface TiptapNode {
	type?: string;
	text?: string;
	content?: TiptapNode[];
	// biome-ignore lint/suspicious/noExplicitAny: allow for other properties
	[key: string]: any;
}

const extractTextFromTiptapJson = (tiptapJson: TiptapNode | null): string => {
	if (
		!tiptapJson ||
		typeof tiptapJson !== "object" ||
		!Array.isArray(tiptapJson.content)
	) {
		return "";
	}

	let fullText = "";

	const traverse = (node: TiptapNode) => {
		if (node.type === "text" && node.text) {
			fullText += node.text;
		}

		if (node.content && Array.isArray(node.content)) {
			node.content.forEach(traverse);
		}

		// Add spaces after block-level elements for readability
		if (
			node.type === "paragraph" ||
			node.type === "heading" ||
			node.type === "listItem"
		) {
			if (!fullText.endsWith(" ")) {
				fullText += " ";
			}
		}
	};

	tiptapJson.content.forEach(traverse);

	return fullText
		.replace(/[ \t]+/g, " ") // Replace multiple spaces/tabs with a single space
		.trim();
};

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
				dob: true,
				recordsNeeded: true,
				babyNetERNeeded: true,
				babyNetERDownloaded: true,
			},
		});

		if (!client) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		const [externalRecord, mostRecentAppointment] = await Promise.all([
			db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, clientId),
				columns: {
					content: true,
					requested: true,
					needsSecondRequest: true,
					secondRequestDate: true,
				},
			}),
			db
				.select({
					startTime: appointments.startTime,
					providerName: evaluators.providerName,
				})
				.from(appointments)
				.leftJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.where(
					and(
						eq(appointments.clientId, clientId),
						isNotNull(appointments.calendarEventId),
						eq(appointments.cancelled, false),
					),
				)
				.orderBy(desc(appointments.startTime))
				.limit(1)
				.then((res) => res[0]),
		]);

		const fullNote = extractTextFromTiptapJson(
			externalRecord?.content as TiptapNode,
		).trim();
		const matchedTemplate = NOTE_TEMPLATES.find((t) =>
			fullNote.includes(t.text),
		);
		const recordsNote = matchedTemplate ? matchedTemplate.label : fullNote;
		const recordsReviewed = fullNote.length > 0;

		let recordsStatus: string | boolean = false;
		if (client.recordsNeeded === "Needed") {
			if (recordsReviewed) {
				recordsStatus = recordsNote;
			} else if (!externalRecord?.requested) {
				recordsStatus = "Needed but not requested";
			} else if (externalRecord.secondRequestDate) {
				recordsStatus = `Requested again ${externalRecord.secondRequestDate} and not received/reviewed`;
			} else if (externalRecord.needsSecondRequest) {
				recordsStatus = `Requested ${externalRecord.requested}, second request needed but not made, and not received/reviewed`;
			} else {
				recordsStatus = `Requested ${externalRecord.requested} and not received/reviewed`;
			}
		}

		let babyNetERStatus: string | boolean = false;
		if (client.babyNetERNeeded) {
			babyNetERStatus = client.babyNetERNeeded
				? "Downloaded"
				: "Needed but not downloaded";
		}

		return NextResponse.json({
			fullName: client.fullName,
			dob: client.dob.toLocaleDateString(undefined, {
				year: "2-digit",
				month: "numeric",
				day: "numeric",
			}),
			age: formatClientAge(client.dob, "short"),
			records: recordsStatus,
			babyNetERStatus: babyNetERStatus,
			mostRecentAppointment:
				mostRecentAppointment?.startTime.toLocaleDateString(undefined, {
					year: "2-digit",
					month: "numeric",
					day: "numeric",
				}),
			mostRecentAppointmentProvider: mostRecentAppointment?.providerName,
		});
	} catch (error) {
		console.error("Database query failed:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
