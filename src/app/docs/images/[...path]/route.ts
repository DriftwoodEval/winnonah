import fs from "node:fs";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { resolveDocsAssetPath } from "~/lib/docs";

const CONTENT_TYPES: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

const OPTIMIZABLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_WIDTH = 1600;

interface RouteParams {
	params: Promise<{ path: string[] }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
	const { path: segments } = await params;
	const ext = segments
		.at(-1)
		?.match(/\.[^.]+$/)?.[0]
		?.toLowerCase();
	const contentType = ext ? CONTENT_TYPES[ext] : undefined;

	if (!contentType) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const filePath = resolveDocsAssetPath(segments);
	if (!filePath) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const file = fs.readFileSync(filePath);

	if (!OPTIMIZABLE_TYPES.has(contentType)) {
		return new NextResponse(file, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=3600",
			},
		});
	}

	const optimized = await sharp(file)
		.resize({ width: MAX_WIDTH, withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();

	return new NextResponse(optimized, {
		headers: {
			"Content-Type": "image/webp",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
