"use client";

import { Button } from "@ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTrigger,
} from "@ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
	BookOpen,
	Calculator,
	Calendar1,
	CalendarDays,
	CalendarRange,
	ChevronDown,
	ClipboardClock,
	Clock,
	FileText,
	Home,
	LayoutDashboard,
	LineChart,
	type LucideIcon,
	Menu,
	Users,
	Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

type NavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
	show: boolean;
};

function isNavItemActive(href: string, pathname: string) {
	if (href === "/") return pathname === href;
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavigationLink({
	href,
	children,
	pathname,
	icon: Icon,
}: {
	href: string;
	children: string;
	pathname: string;
	icon: LucideIcon;
}) {
	const isActive = isNavItemActive(href, pathname);
	return (
		<Link
			aria-label={children}
			className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm hover:bg-muted ${isActive ? "text-secondary" : ""}`}
			href={href}
		>
			<Icon className="h-4 w-4 shrink-0" />
			<span className="hidden xl:inline">{children}</span>
		</Link>
	);
}

function NavigationCategory({
	label,
	icon: Icon,
	items,
	pathname,
}: {
	label: string;
	icon: LucideIcon;
	items: NavItem[];
	pathname: string;
}) {
	const [open, setOpen] = useState(false);
	const closeTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		return () => {
			clearTimeout(closeTimeout.current);
		};
	}, []);

	const visibleItems = items.filter((item) => item.show);

	if (visibleItems.length === 0) return null;

	if (visibleItems.length === 1) {
		const item = visibleItems[0];
		if (!item) return null;
		return (
			<NavigationLink href={item.href} icon={item.icon} pathname={pathname}>
				{item.label}
			</NavigationLink>
		);
	}

	const isCategoryActive = visibleItems.some((item) =>
		isNavItemActive(item.href, pathname),
	);

	const openNow = () => {
		clearTimeout(closeTimeout.current);
		setOpen(true);
	};
	const closeSoon = () => {
		closeTimeout.current = setTimeout(() => setOpen(false), 150);
	};

	return (
		<DropdownMenu modal={false} onOpenChange={setOpen} open={open}>
			<DropdownMenuTrigger
				asChild
				onMouseEnter={openNow}
				onMouseLeave={closeSoon}
			>
				<Button
					aria-label={label}
					className={`cursor-pointer gap-1.5 px-2 ${isCategoryActive ? "text-secondary" : ""}`}
					variant="ghost"
				>
					<Icon className="h-4 w-4 shrink-0" />
					<span className="hidden xl:inline">{label}</span>
					<ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				onMouseEnter={openNow}
				onMouseLeave={closeSoon}
			>
				{visibleItems.map((item) => (
					<DropdownMenuItem asChild className="cursor-pointer" key={item.href}>
						<Link
							className={
								isNavItemActive(item.href, pathname) ? "text-secondary" : ""
							}
							href={item.href}
						>
							<item.icon className="h-4 w-4" />
							{item.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default function NavigationLinks() {
	const { data: session } = useSession();
	const can = useCheckPermission();
	const pathname = usePathname();
	const canSeeEvalReportDashboard =
		(session?.user.isEvaluator ?? false) || can("evaluator-dashboard:admin");
	const { data: evalReportDashboardConfig } =
		api.evaluatorDashboard.getConfig.useQuery(undefined, {
			enabled: canSeeEvalReportDashboard,
		});
	const evalReportDashboardLabel = evalReportDashboardConfig?.evaluatorFirstName
		? `${evalReportDashboardConfig.evaluatorFirstName}'s Reports`
		: "Report Dashboard";

	if (!session) return null;

	const home: NavItem = {
		href: "/",
		label: "Home",
		icon: Home,
		show: true,
	};

	const docs: NavItem = {
		href: "/docs",
		label: "Docs",
		icon: BookOpen,
		show: false,
	};

	const categories: { label: string; icon: LucideIcon; items: NavItem[] }[] = [
		{
			label: "Clients",
			icon: Users,
			items: [
				{
					href: "/dashboard",
					label: "Dashboard",
					icon: LayoutDashboard,
					show: can("pages:dashboard"),
				},
				{
					href: "/clients/directory",
					label: "Directory",
					icon: Users,
					show: true,
				},
			],
		},
		{
			label: "Schedule",
			icon: CalendarDays,
			items: [
				{
					href: "/day-ahead",
					label: "Day Ahead",
					icon: Calendar1,
					show: true,
				},
				{
					href: "/availability",
					label: "Availability",
					icon: Clock,
					show: can("pages:availability"),
				},
				{
					href: "/scheduling",
					label: "Scheduling",
					icon: CalendarRange,
					show: can("pages:scheduling"),
				},
			],
		},
		{
			label: "Reports",
			icon: FileText,
			items: [
				{
					href: "/claim-reports",
					label: "Claim Reports",
					icon: FileText,
					show: session.user.maxClaimedReports !== 0 || can("reports:approve"),
				},
				{
					href: "/evaluator-dashboard",
					label: evalReportDashboardLabel,
					icon: LineChart,
					show: canSeeEvalReportDashboard,
				},
			],
		},
		{
			label: "Tools",
			icon: Wrench,
			items: [
				{
					href: "/work-summary",
					label: "Work Summary",
					icon: ClipboardClock,
					show: can("pages:work-summary"),
				},
				{
					href: "/calculator",
					label: "Calculator",
					icon: Calculator,
					show: can("pages:calculator"),
				},
			],
		},
	];

	const allItems = [
		home,
		...categories.flatMap((category) => category.items),
		docs,
	].filter((item) => item.show);

	return (
		<>
			{/* Desktop Navigation */}
			<div className="hidden items-center gap-1 md:flex">
				<NavigationLink href={home.href} icon={home.icon} pathname={pathname}>
					{home.label}
				</NavigationLink>
				{categories.map((category) => (
					<NavigationCategory
						icon={category.icon}
						items={category.items}
						key={category.label}
						label={category.label}
						pathname={pathname}
					/>
				))}
				<NavigationLink href={docs.href} icon={docs.icon} pathname={pathname}>
					{docs.label}
				</NavigationLink>
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
							{allItems.map((item) => (
								<DrawerClose asChild key={item.href}>
									<Link
										className={`flex items-center gap-2 ${
											isNavItemActive(item.href, pathname)
												? "text-secondary"
												: ""
										}`}
										href={item.href}
									>
										<item.icon className="h-4 w-4" />
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
