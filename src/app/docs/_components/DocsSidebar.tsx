"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocNavCategory } from "~/lib/docs";
import { cn } from "~/lib/utils";

export function DocsSidebar({ nav }: { nav: DocNavCategory[] }) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);

	return (
		<nav className="flex flex-col gap-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
			<button
				className="flex items-center justify-between rounded-md border border-input px-3 py-1.5 text-sm md:hidden"
				onClick={() => setOpen((prev) => !prev)}
				type="button"
			>
				Browse docs
				<ChevronDown
					className={cn("size-4 transition-transform", open && "rotate-180")}
				/>
			</button>
			<div className={cn("flex-col gap-6 md:flex", open ? "flex" : "hidden")}>
				{nav.map((category) => (
					<div key={category.slug}>
						<h2 className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							{category.title}
						</h2>
						<ul className="mt-1 flex flex-col gap-0.5">
							{category.items.map((item) => {
								const href = `/docs/${item.slug.join("/")}`;
								const isActive = pathname === href;

								return (
									<li key={href}>
										<Link
											className={cn(
												"block rounded-md px-3 py-1.5 text-sm",
												isActive
													? "bg-accent font-medium text-accent-foreground"
													: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
											)}
											href={href}
											onClick={() => setOpen(false)}
										>
											{item.title}
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>
		</nav>
	);
}
