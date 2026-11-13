"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Redact } from "@components/redaction/Redact";
import type { FilterOption } from "@components/shared/ColumnFilter";
import { TableHead } from "@ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { cn } from "~/lib/utils";

export type SortDir = "asc" | "desc";

export const CLIENT_STATUS_OPTIONS: FilterOption[] = [
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
];

export function clientStatusValue(row: { clientActive: boolean }): string {
	return row.clientActive ? "active" : "inactive";
}

export function toggleValue(values: string[], value: string): string[] {
	return values.includes(value)
		? values.filter((v) => v !== value)
		: [...values, value];
}

export function countBy<T>(
	rows: T[],
	getKey: (row: T) => string,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const key = getKey(row);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

export function SortableHead<K extends string>({
	label,
	sortKey,
	sort,
	sortDir,
	onSort,
	filter,
}: {
	label: string;
	sortKey: K;
	sort: K;
	sortDir: SortDir;
	onSort: (key: K) => void;
	filter?: React.ReactNode;
}) {
	const active = sort === sortKey;
	const SortIcon = active
		? sortDir === "asc"
			? ArrowUp
			: ArrowDown
		: ArrowUpDown;

	return (
		<TableHead>
			<div className="flex items-center gap-1">
				<button
					className={cn(
						"flex items-center gap-1 transition-colors",
						active
							? "font-semibold text-primary"
							: "text-foreground hover:text-primary",
					)}
					onClick={() => onSort(sortKey)}
					type="button"
				>
					{label}
					<SortIcon
						className={cn(
							"h-3.5 w-3.5",
							active ? "text-primary" : "text-muted-foreground/60",
						)}
					/>
				</button>
				{filter}
			</div>
		</TableHead>
	);
}

export function ClientLink({
	hash,
	name,
	active,
}: {
	hash: string;
	name: string;
	active: boolean;
}) {
	return (
		<>
			<Link className="font-medium hover:underline" href={`/clients/${hash}`}>
				<ClientHoverCard clientHash={hash}>
					<Redact>{name}</Redact>
				</ClientHoverCard>
			</Link>
			{!active && (
				<span className="ml-2 text-xs text-muted-foreground">Inactive</span>
			)}
		</>
	);
}
