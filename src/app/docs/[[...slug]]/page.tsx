import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TableOfContents } from "~/app/docs/_components/TableOfContents";
import {
	getAllDocSlugs,
	getDocBySlug,
	getDocHeadings,
	getDocRelativePath,
	getDocsNav,
} from "~/lib/docs";

interface PageProps {
	params: Promise<{ slug?: string[] }>;
}

export function generateStaticParams() {
	return getAllDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug = [] } = await params;
	const doc = getDocBySlug(slug);
	return { title: doc?.frontmatter.title ?? "Docs" };
}

export default async function DocsPage({ params }: PageProps) {
	const { slug = [] } = await params;

	if (slug.length === 0) {
		const [firstDoc] = getDocsNav();
		if (!firstDoc) notFound();
		redirect(`/docs/${firstDoc.slug.join("/")}`);
	}

	const doc = getDocBySlug(slug);
	const relativePath = getDocRelativePath(slug);

	if (!doc || !relativePath) notFound();

	const { default: Content } = await import(`~/content/docs/${relativePath}`);

	return (
		<div className="flex gap-8">
			<article className="prose dark:prose-invert min-w-0 max-w-none flex-1">
				<h1>{doc.frontmatter.title}</h1>
				<Content />
			</article>
			<TableOfContents headings={getDocHeadings(slug)} />
		</div>
	);
}
