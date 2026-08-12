import { inArray } from "drizzle-orm";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getDriveClient } from "~/lib/google";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { faxCategorizations } from "~/server/db/schema";

// python/categorize_documents.py's --eval mode expects PDFs named
// "..._<Category>.pdf", reading the segment after the last underscore as
// the ground-truth category, so each entry keeps a human-readable stem,
// the fax id (for uniqueness), and the reviewer-confirmed category.
function sanitizeForFilename(value: string): string {
	return value.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export const GET = auth(async (req) => {
	if (!req.auth) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	if (!hasPermission(req.auth.user.permissions, "fax:categorization:review")) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	const { searchParams } = new URL(req.url);
	const ids = (searchParams.get("ids") ?? "")
		.split(",")
		.map((id) => Number(id))
		.filter((id) => Number.isInteger(id));

	if (ids.length === 0) {
		return new NextResponse("No fax ids provided", { status: 400 });
	}

	const faxes = await db.query.faxCategorizations.findMany({
		where: inArray(faxCategorizations.id, ids),
		columns: {
			id: true,
			driveFileId: true,
			fileName: true,
			category: true,
			status: true,
		},
	});

	const reviewed = faxes.filter(
		(fax) => fax.status === "reviewed" && fax.category,
	);

	if (reviewed.length === 0) {
		return new NextResponse("No reviewed faxes found for the given ids", {
			status: 400,
		});
	}

	const driveApi = getDriveClient(req.auth);
	const zip = new JSZip();

	for (const fax of reviewed) {
		try {
			const response = await driveApi.files.get(
				{ fileId: fax.driveFileId, alt: "media" },
				{ responseType: "arraybuffer" },
			);
			const stem = sanitizeForFilename(fax.fileName);
			zip.file(
				`${stem}_${fax.id}_${fax.category}.pdf`,
				response.data as ArrayBuffer,
			);
		} catch {
			// Skip files Drive can't return rather than failing the whole export.
		}
	}

	const zipBytes = await zip.generateAsync({ type: "arraybuffer" });

	return new NextResponse(zipBytes, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition":
				'attachment; filename="fax-categorization-eval.zip"',
		},
	});
});
