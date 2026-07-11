import { Guard } from "@components/layout/Guard";
import { getDocsNavTree } from "~/lib/docs";
import { DocsSearch } from "./_components/DocsSearch";
import { DocsSidebar } from "./_components/DocsSidebar";

export default function DocsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const nav = getDocsNavTree();

	return (
		<Guard>
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:gap-8">
				<div className="flex w-full flex-col gap-4 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56 md:shrink-0">
					<DocsSearch />
					<DocsSidebar nav={nav} />
				</div>
				<div className="min-w-0 flex-1">{children}</div>
			</div>
		</Guard>
	);
}
