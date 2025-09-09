"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(path: string) {
	return path === usePathname();
}

export function NavigationLink({
	href,
	children,
}: {
	href: string;
	children: string;
}) {
	return (
		<Link className={isActive(href) ? "text-accent" : ""} href={href}>
			{children}
		</Link>
	);
}

export default function NavigationLinks() {
	return (
		<div className="flex gap-4 text-sm">
			<NavigationLink href="/">Clients</NavigationLink>
			<NavigationLink href="/dashboard">Dashboard</NavigationLink>
		</div>
	);
}
