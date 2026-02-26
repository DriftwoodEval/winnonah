import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";

export const GET = auth(async (req, { params }) => {
	if (!req.auth) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const { filename } = (await params) as { filename: string };

	if (!filename || filename.includes("..") || filename.includes("/")) {
		return new NextResponse("Invalid filename", { status: 400 });
	}

	const filePath = path.join(process.cwd(), "q-screenshots", filename);

	if (!fs.existsSync(filePath)) {
		return new NextResponse("Not Found", { status: 404 });
	}

	try {
		const fileBuffer = fs.readFileSync(filePath);

		return new NextResponse(fileBuffer, {
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch (_error) {
		return new NextResponse("Error reading file", { status: 500 });
	}
});
