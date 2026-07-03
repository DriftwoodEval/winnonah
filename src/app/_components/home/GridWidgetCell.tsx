"use client";

interface GridWidgetCellProps {
	cols: number;
	rows: number;
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
	1: "calc(25svh - 2rem)",
	2: "calc(50svh - 3rem)",
	3: "calc(75svh - 4rem)",
	4: "calc(100svh - 5rem)",
};

export function GridWidgetCell({ cols, rows, children }: GridWidgetCellProps) {
	const vh = heightVh[rows] ?? "35vh";

	return (
		<div
			className={`min-h-0 overflow-hidden ${colClass[cols] ?? "col-span-full"} ${rowClass[rows] ?? "row-[span_1]"}`}
			style={{ height: vh }}
		>
			{children}
		</div>
	);
}
