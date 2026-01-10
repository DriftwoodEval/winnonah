"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { hasPermission } from "~/lib/utils";

export function NavigationLink({
	href,
	children,
	pathname,
}: {
	href: string;
	children: string;
	pathname: string;
}) {
	const isActive = pathname === href;
	return (
		<Link className={isActive ? "text-accent" : ""} href={href}>
			{children}
		</Link>
	);
}

export default function NavigationLinks() {
	const { data: session } = useSession();
	const pathname = usePathname();

	const canDashboard = session
		? hasPermission(session.user.permissions, "pages:dashboard")
		: false;
	const canCalculator = session
		? hasPermission(session.user.permissions, "pages:calculator")
		: false;
	const canSchedule = session
		? hasPermission(session.user.permissions, "pages:scheduling")
		: false;

	return (
		<div className="flex gap-4 text-sm">
			<NavigationLink href="/" pathname={pathname}>
				Clients
			</NavigationLink>
			{canDashboard && (
				<NavigationLink href="/dashboard" pathname={pathname}>
					Dashboard
				</NavigationLink>
			)}
			{canCalculator && (
				<NavigationLink href="/calculator" pathname={pathname}>
					Calculator
				</NavigationLink>
			)}
			{canSchedule && (
				<NavigationLink href="/scheduling" pathname={pathname}>
					Scheduling
				</NavigationLink>
			)}
		</div>
	);
}
