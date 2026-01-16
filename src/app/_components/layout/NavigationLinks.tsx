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

	const navItems = [
		{
			href: "/",
			label: "Clients",
			show: true,
		},
		{
			href: "/dashboard",
			label: "Dashboard",
			show: session
				? hasPermission(session.user.permissions, "pages:dashboard")
				: false,
		},
		{
			href: "/calculator",
			label: "Calculator",
			show: session
				? hasPermission(session.user.permissions, "pages:calculator")
				: false,
		},
		{
			href: "/scheduling",
			label: "Scheduling",
			show: session
				? hasPermission(session.user.permissions, "pages:scheduling")
				: false,
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
										className={pathname === item.href ? "text-accent" : ""}
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
