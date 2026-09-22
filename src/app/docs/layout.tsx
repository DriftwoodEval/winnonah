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
			<div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 lg:flex-row lg:gap-8">
				<div className="flex w-full flex-col gap-4 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-56 lg:shrink-0">
					<DocsSearch />
					<DocsSidebar nav={nav} />
				</div>
				<div className="min-w-0 flex-1">{children}</div>
			</div>
		</Guard>
	);
}
