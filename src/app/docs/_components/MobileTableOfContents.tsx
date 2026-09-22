import { ChevronDown, SquarePen } from "lucide-react";
import Link from "next/link";
import type { DocHeading } from "~/lib/docs";
import { cn } from "~/lib/utils";

const EDIT_BASE_URL =
	"https://github.com/DriftwoodEval/winnonah/edit/main/src/content/docs";

const INDENT_BY_DEPTH: Record<number, string> = {
	2: "pl-3",
	3: "pl-6",
	4: "pl-9",
};

/**
 * Collapsible "On this page" list shown above the article on narrow screens,
 * where the sticky sidebar `TableOfContents` is hidden.
 */
export function MobileTableOfContents({
	headings,
	editPath,
}: {
	headings: DocHeading[];
	editPath?: string;
}) {
	if (headings.length === 0 && !editPath) return null;

	return (
		<details className="not-prose mb-6 rounded-lg border border-border lg:hidden">
			<summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-medium text-sm [&::-webkit-details-marker]:hidden">
				On this page
				<ChevronDown className="size-4" />
			</summary>
			<div className="border-border border-t px-1 py-1">
				{headings.length > 0 && (
					<ul className="flex flex-col gap-0.5">
						{headings.map((heading) => (
							<li key={heading.id}>
								<Link
									className={cn(
										"block rounded-md py-1 pr-3 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground",
										INDENT_BY_DEPTH[Math.min(heading.depth, 4)] ?? "pl-9",
									)}
									href={`#${heading.id}`}
								>
									{heading.text}
								</Link>
							</li>
						))}
					</ul>
				)}
				{editPath && (
					<a
						className="mt-1 flex items-center gap-1.5 rounded-md px-3 py-1 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
						href={`${EDIT_BASE_URL}/${editPath}`}
						rel="noreferrer"
						target="_blank"
					>
						<SquarePen className="size-3.5" />
						Edit this page
					</a>
				)}
			</div>
		</details>
	);
}
