"use client";

import { SquarePen } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DocHeading } from "~/lib/docs";
import { cn } from "~/lib/utils";

const EDIT_BASE_URL =
	"https://github.com/DriftwoodEval/winnonah/edit/main/src/content/docs";

const INDENT_BY_DEPTH: Record<number, string> = {
	2: "pl-3",
	3: "pl-6",
	4: "pl-9",
};

const TEXT_SIZE_BY_DEPTH: Record<number, string> = {
	2: "text-sm",
	3: "text-sm",
	4: "text-xs",
};

function headingClass(depth: number): string {
	const clamped = Math.min(depth, 4);
	return cn(
		INDENT_BY_DEPTH[clamped] ?? "pl-9",
		TEXT_SIZE_BY_DEPTH[clamped] ?? "text-xs",
	);
}

export function TableOfContents({
	headings,
	editPath,
}: {
	headings: DocHeading[];
	editPath?: string;
}) {
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		if (headings.length === 0) return;

		const elements = headings
			.map((heading) => document.getElementById(heading.id))
			.filter((el): el is HTMLElement => el !== null);

		const visibleIds = new Set<string>();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						visibleIds.add(entry.target.id);
					} else {
						visibleIds.delete(entry.target.id);
					}
				}

				const firstVisible = headings.find((heading) =>
					visibleIds.has(heading.id),
				);
				if (firstVisible) setActiveId(firstVisible.id);
			},
			{ rootMargin: "-56px 0px -90% 0px" },
		);

		for (const el of elements) observer.observe(el);
		return () => observer.disconnect();
	}, [headings]);

	if (headings.length === 0 && !editPath) return null;

	return (
		<nav className="sticky top-14 hidden max-h-[calc(100vh-5.5rem)] shrink-0 overflow-y-auto md:block md:w-56">
			{headings.length > 0 && (
				<>
					<h2 className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						On this page
					</h2>
					<ul className="mt-2 flex flex-col gap-0.5">
						{headings.map((heading) => (
							<li key={heading.id}>
								<Link
									className={cn(
										"block rounded-md py-1 pr-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
										headingClass(heading.depth),
										heading.id === activeId &&
											"bg-accent font-medium text-accent-foreground",
									)}
									href={`#${heading.id}`}
								>
									{heading.text}
								</Link>
							</li>
						))}
					</ul>
				</>
			)}
			{editPath && (
				<a
					className="mt-4 flex items-center gap-1.5 rounded-md px-3 py-1 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
					href={`${EDIT_BASE_URL}/${editPath}`}
					rel="noreferrer"
					target="_blank"
				>
					<SquarePen className="size-3.5" />
					Edit this page
				</a>
			)}
		</nav>
	);
}
