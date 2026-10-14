import { Skeleton } from "@ui/skeleton";
import { cn } from "~/lib/utils";

interface ListSkeletonProps {
	rows?: number;
	/** Height of each row, as a Tailwind class. */
	rowClassName?: string;
	className?: string;
}

/** Placeholder rows for lists and widgets while their data loads. */
export function ListSkeleton({
	rows = 5,
	rowClassName = "h-8",
	className,
}: ListSkeletonProps) {
	return (
		<div aria-busy="true" className={cn("flex flex-col gap-2", className)}>
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<Skeleton className={cn("w-full", rowClassName)} key={i} />
			))}
		</div>
	);
}

interface TableSkeletonProps {
	rows?: number;
	columns?: number;
	className?: string;
}

/** Placeholder grid for tables while their data loads. */
export function TableSkeleton({
	rows = 8,
	columns = 5,
	className,
}: TableSkeletonProps) {
	return (
		<div aria-busy="true" className={cn("flex flex-col gap-2", className)}>
			<Skeleton className="h-9 w-full" />
			{Array.from({ length: rows }, (_, row) => (
				<div
					className="grid gap-2"
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
					key={row}
					style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
				>
					{Array.from({ length: columns }, (_, col) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<Skeleton className="h-6" key={col} />
					))}
				</div>
			))}
		</div>
	);
}
