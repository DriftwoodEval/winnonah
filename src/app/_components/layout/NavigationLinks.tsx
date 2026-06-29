"use client";

import { Button } from "@ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTrigger,
} from "@ui/drawer";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

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
		<Link className={isActive ? "text-secondary" : ""} href={href}>
			{children}
		</Link>
	);
}

export default function NavigationLinks() {
	const { data: session } = useSession();
	const can = useCheckPermission();
	const pathname = usePathname();
	const canSeeDashboard =
		(session?.user.isEvaluator ?? false) || can("evaluator-dashboard:admin");
	const { data: dashboardConfig } = api.evaluatorDashboard.getConfig.useQuery(
		undefined,
		{ enabled: canSeeDashboard },
	);
	const dashboardLabel = dashboardConfig?.evaluatorFirstName
		? `${dashboardConfig.evaluatorFirstName}'s Reports`
		: "Report Dashboard";

	if (!session) return null;

	const navItems = [
		{
			href: "/",
			label: "Clients",
			show: true,
		},
		{
			href: "/day-ahead",
			label: "Day Ahead",
			show: true,
		},
		{
			href: "/availability",
			label: "Availability",
			show: can("pages:availability"),
		},
		{
			href: "/dashboard",
			label: "Dashboard",
			show: can("pages:dashboard"),
		},
		{
			href: "/calculator",
			label: "Calculator",
			show: can("pages:calculator"),
		},
		{
			href: "/scheduling",
			label: "Scheduling",
			show: can("pages:scheduling"),
		},
		{
			href: "/claim-reports",
			label: "Claim Reports",
			show: session.user.maxClaimedReports !== 0 || can("reports:approve"),
		},
		{
			href: "/work-summary",
			label: "Work Summary",
			show: can("pages:work-summary"),
		},
		{
			href: "/evaluator-dashboard",
			label: dashboardLabel,
			show: canSeeDashboard,
		},
	].filter((item) => item.show);

	return (
		<>
			{/* Desktop Navigation */}
			<div className="hidden gap-4 text-sm md:flex">
				{navItems.map((item) => (
					<NavigationLink href={item.href} key={item.href} pathname={pathname}>
						{item.label}
					</NavigationLink>
				))}
			</div>

			{/* Mobile Navigation */}
			<div className="md:hidden">
				<Drawer direction="left">
					<DrawerTrigger asChild>
						<Button size="icon" variant="ghost">
							<Menu className="h-5 w-5" />
							<span className="sr-only">Toggle navigation</span>
						</Button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader className="text-left"></DrawerHeader>
						<div className="flex flex-col gap-4 p-4">
							{navItems.map((item) => (
								<DrawerClose asChild key={item.href}>
									<Link
										className={pathname === item.href ? "text-secondary" : ""}
										href={item.href}
									>
										{item.label}
									</Link>
								</DrawerClose>
							))}
						</div>
					</DrawerContent>
				</Drawer>
			</div>
		</>
	);
}
