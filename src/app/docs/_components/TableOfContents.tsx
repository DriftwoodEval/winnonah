"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DocHeading } from "~/lib/docs";
import { cn } from "~/lib/utils";

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

export function TableOfContents({ headings }: { headings: DocHeading[] }) {
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

	if (headings.length === 0) return null;

	return (
		<nav className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto xl:block xl:w-56">
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
		</nav>
	);
}
