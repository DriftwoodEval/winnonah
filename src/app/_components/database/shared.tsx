"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Redact } from "@components/redaction/Redact";
import type { FilterOption } from "@components/shared/ColumnFilter";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TableHead } from "@ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export type SortDir = "asc" | "desc";

export const CLIENT_STATUS_OPTIONS: FilterOption[] = [
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
];

/** True unless the client status filter is the default of active clients only. */
export function clientStatusFilterChanged(selected: string[]): boolean {
	return selected.length !== 1 || selected[0] !== "active";
}

export function clientStatusValue(row: { clientActive: boolean }): string {
	return row.clientActive ? "active" : "inactive";
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

/** Max height of a virtualized table's scroll area. The table's own wrapper
 * scrolls, with the header pinned, so only the rows in view are mounted. */
export const VIRTUAL_TABLE_HEIGHT = "max-h-[calc(100dvh-16rem)]";

/** Pinned header for a virtualized table. */
export const VIRTUAL_TABLE_HEADER = "sticky top-0 z-10 bg-background";

/**
 * Windowed rows for a `<Table>`. Attach `scrollRef` to the Table (its wrapper
 * scrolls), render a SpacerRow of `paddingTop` height, then one element per
 * virtual item with `data-index={item.index}` and `ref={measureElement}`, then
 * a SpacerRow of `paddingBottom`. Rows are measured, so they may vary in height.
 */
export function useVirtualRows(count: number, estimateSize: number) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimateSize,
		overscan: 10,
	});
	const items = virtualizer.getVirtualItems();
	const first = items[0];
	const last = items[items.length - 1];
	return {
		scrollRef,
		items,
		measureElement: virtualizer.measureElement,
		paddingTop: first?.start ?? 0,
		paddingBottom: last ? virtualizer.getTotalSize() - last.end : 0,
	};
}

/** Empty row standing in for the rows scrolled out of view. */
export function SpacerRow({
	height,
	colSpan,
}: {
	height: number;
	colSpan: number;
}) {
	if (height <= 0) return null;
	return (
		<tr aria-hidden>
			<td colSpan={colSpan} style={{ height, padding: 0 }} />
		</tr>
	);
}

/**
 * Saves a Database table's filters and sorts per user and restores them on the
 * next visit. `snapshot` is the current view state, `restore` applies a saved
 * one (it must tolerate missing or extra keys). Changes are saved after a short
 * pause, and nothing is saved until the saved view has been restored.
 */
export function useSavedView<T extends object>(
	table: "questionnaires" | "externalRecords" | "appointments",
	snapshot: T,
	restore: (saved: Partial<T>) => void,
	// When false the saved view is neither restored nor overwritten, so a view
	// opened from a link leaves the user's own saved filters alone.
	enabled = true,
) {
	const { data } = api.users.getDatabaseViews.useQuery(undefined, {
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const save = api.users.setDatabaseView.useMutation();
	const [restored, setRestored] = useState(false);

	useEffect(() => {
		if (!enabled || restored || !data) return;
		try {
			const saved = JSON.parse(data[table] ?? "null");
			if (saved && typeof saved === "object") restore(saved as Partial<T>);
		} catch {
			// An unreadable saved view is ignored and the defaults stay.
		}
		setRestored(true);
	}, [data, restored, table, restore, enabled]);

	const key = JSON.stringify(snapshot);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the serialized snapshot
	useEffect(() => {
		if (!restored) return;
		const timer = setTimeout(() => save.mutate({ table, view: key }), 500);
		return () => clearTimeout(timer);
	}, [key, restored, table]);
}

/** Fixed column widths (percentages summing to 100) so a virtualized table's
 * columns don't resize as different rows scroll into view. Pass `FIXED_TABLE`
 * as the Table's `className`. The minimum width keeps columns readable on narrow
 * screens: the table's wrapper scrolls sideways instead of squashing them. */
export const FIXED_TABLE = "table-fixed min-w-[1000px]";

export function FixedCols({ widths }: { widths: number[] }) {
	return (
		<colgroup>
			{widths.map((w, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static list that never reorders
				<col key={i} style={{ width: `${w}%` }} />
			))}
		</colgroup>
	);
}
