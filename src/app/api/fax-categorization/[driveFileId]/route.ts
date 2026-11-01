import { NextResponse } from "next/server";
import { getDriveClient } from "~/lib/integrations/google";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ driveFileId: string }> },
) {
	const session = await auth();
	if (!session) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	if (!hasPermission(session.user.permissions, "fax:categorization:review")) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	const { driveFileId } = await params;

	if (!driveFileId) {
		return new NextResponse("Invalid file id", { status: 400 });
	}

	try {
		const driveApi = getDriveClient(session);
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
}
