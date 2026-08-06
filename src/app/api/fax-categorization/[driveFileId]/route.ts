import { NextResponse } from "next/server";
import { getDriveClient } from "~/lib/google";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";

export const GET = auth(async (req, { params }) => {
	if (!req.auth) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	if (!hasPermission(req.auth.user.permissions, "fax:categorization:review")) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	const { driveFileId } = (await params) as { driveFileId: string };

	if (!driveFileId) {
		return new NextResponse("Invalid file id", { status: 400 });
	}

	try {
		const driveApi = getDriveClient(req.auth);
		const response = await driveApi.files.get(
			{ fileId: driveFileId, alt: "media" },
			{ responseType: "arraybuffer" },
		);

		return new NextResponse(response.data as ArrayBuffer, {
			headers: {
				"Content-Type": "application/pdf",
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (_error) {
		return new NextResponse("Error fetching file", { status: 500 });
	}
});
