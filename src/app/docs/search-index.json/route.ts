import { NextResponse } from "next/server";
import { getAllDocSlugs, getDocBySlug } from "~/lib/docs";

export interface DocsSearchEntry {
	slug: string;
	title: string;
	content: string;
}

export function GET() {
	const entries: DocsSearchEntry[] = getAllDocSlugs().flatMap((slug) => {
		const doc = getDocBySlug(slug);
		if (!doc) return [];
		return [
			{
				slug: slug.join("/"),
				title: doc.frontmatter.title,
				content: doc.content,
			},
		];
	});

	return NextResponse.json(entries);
}
