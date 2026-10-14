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
