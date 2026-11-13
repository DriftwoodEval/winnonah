"use client";

import { Button } from "@ui/button";

interface JumpLink {
	id: string;
	label: string;
}

/** A row of links that scroll to sections of a long settings page. */
export function SettingsJumpLinks({ items }: { items: JumpLink[] }) {
	return (
		<nav
			aria-label="On this page"
			className="flex flex-wrap items-center gap-1 text-sm"
		>
			<span className="pr-1 text-muted-foreground">On this page:</span>
			{items.map((item) => (
				<Button
					key={item.id}
					onClick={() =>
						document
							.getElementById(item.id)
							?.scrollIntoView({ behavior: "smooth", block: "start" })
					}
					size="sm"
					type="button"
					variant="ghost"
				>
					{item.label}
				</Button>
			))}
		</nav>
	);
}
