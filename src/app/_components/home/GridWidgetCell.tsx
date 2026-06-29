"use client";

import type { WidgetSizing } from "~/lib/home-widgets";

interface GridWidgetCellProps {
	cols: number;
	rows: number;
	sizing: WidgetSizing;
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

const heightVh: Record<number, string> = {
	1: "25vh",
	2: "50vh",
	3: "75vh",
	4: "calc(100svh - 5rem)",
};

export function GridWidgetCell({
	cols,
	rows,
	sizing,
	children,
}: GridWidgetCellProps) {
	const vh = heightVh[rows] ?? "35vh";
	// fill widgets get an explicit height so they always show their panel
	// content widgets get a max-height so long lists scroll rather than expand forever
	const heightStyle = sizing === "fill" ? { height: vh } : { maxHeight: vh };
	const overflowClass = sizing === "fill" ? "overflow-hidden" : "overflow-auto";

	return (
		<div
			className={`min-h-0 ${overflowClass} ${colClass[cols] ?? "col-span-full"} ${rowClass[rows] ?? "row-[span_1]"}`}
			style={heightStyle}
		>
			{children}
		</div>
	);
}
