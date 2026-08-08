"use client";

interface GridWidgetCellProps {
	cols: number;
	rows: number;
	autoHeight?: boolean;
	children: React.ReactNode;
}

const colClass: Record<number, string> = {
	1: "col-span-full sm:[grid-column:span_1]",
	2: "col-span-full sm:[grid-column:span_2]",
	3: "col-span-full sm:[grid-column:span_3]",
	4: "col-span-full sm:[grid-column:span_4]",
};

const rowClass: Record<number, string> = {
	1: "[grid-row:span_1]",
	2: "[grid-row:span_2]",
	3: "[grid-row:span_3]",
	4: "[grid-row:span_4]",
};

// Below sm the grid is a single stacked column (see colClass), so "rows"
// no longer means "this many of N columns worth of viewport height" - it's
// just one card in a scrolling list. A row:4 widget claiming the desktop
// calc (up to ~100svh) would force nearly a full screen of scrolling per
// widget, so mobile gets a flat, modest cap instead of the proportional
// desktop height.
const heightClass: Record<number, string> = {
	1: "h-[min(60vh,420px)] sm:h-[calc(25svh-2rem)]",
	2: "h-[min(60vh,420px)] sm:h-[calc(50svh-3rem)]",
	3: "h-[min(60vh,420px)] sm:h-[calc(75svh-4rem)]",
	4: "h-[min(60vh,420px)] sm:h-[calc(100svh-5rem)]",
};

export function GridWidgetCell({
	cols,
	rows,
	autoHeight,
	children,
}: GridWidgetCellProps) {
	return (
		<div
			className={`min-h-0 overflow-hidden ${colClass[cols] ?? "col-span-full"} ${autoHeight ? "" : (rowClass[rows] ?? "row-[span_1]")} ${autoHeight ? "" : (heightClass[rows] ?? "h-[35vh]")}`}
		>
			{children}
		</div>
	);
}
