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
// just one card in a scrolling list. Heights still scale with rows the same
// way on mobile as desktop, so rows:4 fills the viewport on both.
//
// These are absolute dvh-based heights, not percentages, so they don't
// inherit the header offset that ancestor containers apply via h-full -
// each figure has to subtract that chrome itself: the fixed header
// (Header.tsx, h-10 = 2.5rem) plus the grid container's own padding
// (HomePageContent.tsx: p-4 pb-20 = 1rem top + 5rem bottom, the bottom
// clearing the fixed HomeCustomizer button) = 8.5rem for a full-height
// (rows:4) widget, plus 1rem per row less for the row-gap freed up when a
// widget spans fewer rows.
const heightClass: Record<number, string> = {
	1: "h-[calc(25dvh-5.5rem)]",
	2: "h-[calc(50dvh-6.5rem)]",
	3: "h-[calc(75dvh-7.5rem)]",
	4: "h-[calc(100dvh-8.5rem)]",
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
