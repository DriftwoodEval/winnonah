"use client";

interface GridWidgetCellProps {
	cols: number;
	rows: number;
	children: React.ReactNode;
}

export function GridWidgetCell({ cols, rows, children }: GridWidgetCellProps) {
	return (
		<div
			className="min-h-0 overflow-hidden"
			style={{ gridColumn: `span ${cols}`, gridRow: `span ${rows}` }}
		>
			{children}
		</div>
	);
}
