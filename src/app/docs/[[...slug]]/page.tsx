import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChangelogList } from "~/app/docs/_components/ChangelogList";
import { DocStatusNotice } from "~/app/docs/_components/DocStatusNotice";
import { MobileTableOfContents } from "~/app/docs/_components/MobileTableOfContents";
import { TableOfContents } from "~/app/docs/_components/TableOfContents";
import { CHANGELOG_SLUG, getChangelogHeadings } from "~/lib/changelog";
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

	const isChangelog = slug.join("/") === CHANGELOG_SLUG.join("/");

	if (isChangelog) {
		return (
			<div className="flex items-start gap-8">
				<article className="flex min-w-0 max-w-[75ch] flex-1 flex-col gap-6">
					<h1 className="font-heading font-semibold text-2xl">
						{doc.frontmatter.title}
					</h1>
					<MobileTableOfContents headings={getChangelogHeadings()} />
					<ChangelogList />
				</article>
				<TableOfContents headings={getChangelogHeadings()} />
			</div>
		);
	}

	const { default: Content } = await import(`~/content/docs/${relativePath}`);

	return (
		<div className="flex items-start gap-8">
			<article className="prose dark:prose-invert min-w-0 max-w-[75ch] flex-1">
				<h1>{doc.frontmatter.title}</h1>
				{doc.frontmatter.needsCleanup && (
					<DocStatusNotice variant="needsCleanup" />
				)}
				{doc.frontmatter.notDone && <DocStatusNotice variant="notDone" />}
				<MobileTableOfContents
					editPath={relativePath}
					headings={getDocHeadings(slug)}
				/>
				<Content />
			</article>
			<TableOfContents
				editPath={relativePath}
				headings={getDocHeadings(slug)}
			/>
		</div>
	);
}
