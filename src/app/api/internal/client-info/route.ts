import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "~/server/db";
import { clients, externalRecords } from "~/server/db/schema";

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
				recordsNeeded: true,
				ifsp: true,
				ifspDownloaded: true,
			},
		});

		if (!client) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		const externalRecord = await db.query.externalRecords.findFirst({
			where: eq(externalRecords.clientId, clientId),
			columns: {
				content: true,
				requested: true,
				needsSecondRequest: true,
				secondRequestDate: true,
			},
		});

		const recordsNote = extractTextFromTiptapJson(
			externalRecord?.content as TiptapNode,
		).trim();
		const recordsReviewed = recordsNote.length > 0;

		let recordsStatus: string | boolean = false;
		if (client.recordsNeeded === "Needed") {
			if (recordsReviewed) {
				recordsStatus = recordsNote;
			} else if (!externalRecord?.requested) {
				recordsStatus = "needed but not requested";
			} else if (externalRecord.secondRequestDate) {
				recordsStatus = `requested again ${externalRecord.secondRequestDate} and not reviewed`;
			} else if (externalRecord.needsSecondRequest) {
				recordsStatus = `requested ${externalRecord.requested}, second request needed but not made, and not reviewed`;
			} else {
				recordsStatus = `requested ${externalRecord.requested} and not reviewed`;
			}
		}

		let ifspStatus: string | boolean = false;
		if (client.ifsp) {
			ifspStatus = client.ifspDownloaded
				? "Downloaded"
				: "Needed but not downloaded";
		}

		return NextResponse.json({
			fullName: client.fullName,
			records: recordsStatus,
			ifsp: ifspStatus,
		});
	} catch (error) {
		console.error("Database query failed:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
