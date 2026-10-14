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
import { ChevronDown, type LucideIcon, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
	useHeaderItemAvailability,
	useHeaderItemLabels,
} from "~/hooks/use-header-items";
import {
	HEADER_ITEM_DEFS,
	HEADER_NAV_CATEGORIES,
	type HeaderItemId,
	type HeaderNavItemDef,
	isNavItemDef,
} from "~/lib/layout/header-items";
import { api } from "~/trpc/react";

type NavItem = {
	id: HeaderItemId;
	href: string;
	label: string;
	icon: LucideIcon;
	show: boolean;
};

// A prefix match (e.g. "/scheduling" matching "/scheduling/helper") only
// counts if no sibling nav item's href is a more specific prefix of the
// current path - otherwise both the parent and the more specific item would
// highlight at once.
function isNavItemActive(
	href: string,
	pathname: string,
	allHrefs: string[] = [],
) {
	if (href === "/") return pathname === href;
	if (pathname === href) return true;
	if (!pathname.startsWith(`${href}/`)) return false;
	return !allHrefs.some(
		(other) =>
			other !== href &&
			other.startsWith(`${href}/`) &&
			(pathname === other || pathname.startsWith(`${other}/`)),
	);
}

export function NavigationLink({
	href,
	children,
	pathname,
	icon: Icon,
	allHrefs,
}: {
	href: string;
	children: string;
	pathname: string;
	icon: LucideIcon;
	allHrefs?: string[];
}) {
	const isActive = isNavItemActive(href, pathname, allHrefs);
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
	const allHrefs = visibleItems.map((item) => item.href);

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
		isNavItemActive(item.href, pathname, allHrefs),
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
				className="w-auto min-w-40"
				onMouseEnter={openNow}
				onMouseLeave={closeSoon}
			>
				{visibleItems.map((item) => (
					<DropdownMenuItem asChild className="cursor-pointer" key={item.href}>
						<Link
							className={
								isNavItemActive(item.href, pathname, allHrefs)
									? "text-secondary"
									: ""
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
	const pathname = usePathname();
	const availability = useHeaderItemAvailability();
	const labels = useHeaderItemLabels();
	const { data: headerPrefs } = api.users.getHeaderPreferences.useQuery(
		undefined,
		{ enabled: !!session },
	);
	const hiddenDesktop = new Set(headerPrefs?.desktop ?? []);
	const hiddenMobile = new Set(headerPrefs?.mobile ?? []);

	if (!session) return null;

	const navDefs = HEADER_ITEM_DEFS.filter(isNavItemDef);
	const toNavItem = (def: HeaderNavItemDef): NavItem => ({
		id: def.id,
		href: def.href,
		label: labels[def.id] ?? def.label,
		icon: def.icon,
		show: availability[def.id],
	});
	const findNavItem = (id: HeaderItemId): NavItem => {
		const def = navDefs.find((d) => d.id === id);
		if (!def) throw new Error(`Missing header item definition: ${id}`);
		return toNavItem(def);
	};

	const home = findNavItem("home");
	const docs = findNavItem("docs");

	const categories = HEADER_NAV_CATEGORIES.map((category) => ({
		label: category.label,
		icon: category.icon,
		items: navDefs
			.filter((def) => def.category === category.label)
			.map(toNavItem),
	}));

	const desktopCategories = categories.map((category) => ({
		...category,
		items: category.items.map((item) => ({
			...item,
			show: item.show && !hiddenDesktop.has(item.id),
		})),
	}));

	const allItems = [
		home,
		...categories.flatMap((category) => category.items),
		docs,
	].filter((item) => item.show && !hiddenMobile.has(item.id));
	const allItemHrefs = allItems.map((item) => item.href);

	return (
		<>
			{/* Desktop Navigation */}
			<div className="hidden items-center gap-1 md:flex">
				{!hiddenDesktop.has(home.id) && (
					<NavigationLink href={home.href} icon={home.icon} pathname={pathname}>
						{home.label}
					</NavigationLink>
				)}
				{desktopCategories.map((category) => (
					<NavigationCategory
						icon={category.icon}
						items={category.items}
						key={category.label}
						label={category.label}
						pathname={pathname}
					/>
				))}
				{!hiddenDesktop.has(docs.id) && (
					<NavigationLink href={docs.href} icon={docs.icon} pathname={pathname}>
						{docs.label}
					</NavigationLink>
				)}
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
						<div className="flex flex-col gap-1 overflow-y-auto p-4">
							{allItems.map((item) => (
								<DrawerClose asChild key={item.href}>
									<Link
										className={`flex items-center gap-3 rounded-md px-2 py-3 text-base active:bg-muted ${
											isNavItemActive(item.href, pathname, allItemHrefs)
												? "text-secondary"
												: ""
										}`}
										href={item.href}
									>
										<item.icon className="h-5 w-5" />
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
