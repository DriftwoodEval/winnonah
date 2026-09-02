"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { DocNavCategory, DocNavItem } from "~/lib/docs";
import { cn } from "~/lib/utils";
import { CreateDocPageDialog } from "./CreateDocPageDialog";

function DocsSidebarLink({
	item,
	pathname,
	onNavigate,
}: {
	item: DocNavItem;
	pathname: string;
	onNavigate: () => void;
}) {
	const href = `/docs/${item.slug.join("/")}`;
	const isActive = pathname === href;

	return (
		<li>
			<Link
				className={cn(
					"block rounded-md px-3 py-1.5 text-sm",
					isActive
						? "bg-accent font-medium text-accent-foreground"
						: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
				)}
				href={href}
				onClick={onNavigate}
			>
				{item.title}
			</Link>
		</li>
	);
}

function categoryContainsPath(
	category: DocNavCategory,
	pathname: string,
): boolean {
	return (
		category.items.some(
			(item) => `/docs/${item.slug.join("/")}` === pathname,
		) ||
		category.subcategories.some((sub) => categoryContainsPath(sub, pathname))
	);
}

function ItemList({
	items,
	pathname,
	onNavigate,
}: {
	items: DocNavItem[];
	pathname: string;
	onNavigate: () => void;
}) {
	if (items.length === 0) return null;
	return (
		<ul className="mt-1 flex flex-col gap-0.5">
			{items.map((item) => (
				<DocsSidebarLink
					item={item}
					key={item.slug.join("/")}
					onNavigate={onNavigate}
					pathname={pathname}
				/>
			))}
		</ul>
	);
}

function Subcategory({
	category,
	pathname,
	onNavigate,
}: {
	category: DocNavCategory;
	pathname: string;
	onNavigate: () => void;
}) {
	const [manualOpen, setManualOpen] = useState<boolean | null>(null);
	const open = manualOpen ?? categoryContainsPath(category, pathname);

	return (
		<div className="mt-1 ml-3 border-border border-l pl-2">
			<button
				className="flex w-full items-center justify-between rounded-md px-3 py-1 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
				onClick={() => setManualOpen(!open)}
				type="button"
			>
				{category.title}
				<ChevronDown
					className={cn("size-3.5 transition-transform", open && "rotate-180")}
				/>
			</button>
			{open && (
				<>
					<ItemList
						items={category.items}
						onNavigate={onNavigate}
						pathname={pathname}
					/>
					{category.subcategories.map((sub) => (
						<Subcategory
							category={sub}
							key={sub.slug}
							onNavigate={onNavigate}
							pathname={pathname}
						/>
					))}
				</>
			)}
		</div>
	);
}

function flattenFolders(
	categories: DocNavCategory[],
	parentTitle = "",
): { slug: string; title: string }[] {
	return categories.flatMap((category) => {
		if (category.standalone) return [];
		const title = parentTitle
			? `${parentTitle} / ${category.title}`
			: category.title;
		return [
			{ slug: category.slug, title },
			...flattenFolders(category.subcategories, title),
		];
	});
}

function groupNav(nav: DocNavCategory[]): DocNavCategory[][] {
	const groups: DocNavCategory[][] = [];

	for (const category of nav) {
		const lastGroup = groups.at(-1);
		if (category.standalone && lastGroup?.[0]?.standalone) {
			lastGroup.push(category);
		} else {
			groups.push([category]);
		}
	}

	return groups;
}

export function DocsSidebar({ nav }: { nav: DocNavCategory[] }) {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const onNavigate = () => setOpen(false);

	return (
		<nav className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
			<button
				className="flex items-center justify-between rounded-md border border-input px-3 py-1.5 text-sm lg:hidden"
				onClick={() => setOpen((prev) => !prev)}
				type="button"
			>
				Browse docs
				<ChevronDown
					className={cn("size-4 transition-transform", open && "rotate-180")}
				/>
			</button>
			<div className={cn("flex-col gap-6 lg:flex", open ? "flex" : "hidden")}>
				{groupNav(nav).map((group) =>
					group[0]?.standalone ? (
						<ul
							className="flex flex-col gap-0.5"
							key={group.map((category) => category.slug).join("-")}
						>
							{group.flatMap((category) =>
								category.items.map((item) => (
									<DocsSidebarLink
										item={item}
										key={item.slug.join("/")}
										onNavigate={onNavigate}
										pathname={pathname}
									/>
								)),
							)}
						</ul>
					) : (
						group.map((category) => (
							<div key={category.slug}>
								<h2 className="px-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									{category.title}
								</h2>
								<ItemList
									items={category.items}
									onNavigate={onNavigate}
									pathname={pathname}
								/>
								{category.subcategories.map((sub) => (
									<Subcategory
										category={sub}
										key={sub.slug}
										onNavigate={onNavigate}
										pathname={pathname}
									/>
								))}
							</div>
						))
					),
				)}
				<CreateDocPageDialog folders={flattenFolders(nav)} />
			</div>
		</nav>
	);
}
