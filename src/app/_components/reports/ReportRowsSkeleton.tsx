import { Skeleton } from "@ui/skeleton";

const ROW_KEYS = ["a", "b", "c", "d", "e"] as const;

/** Placeholder rows shown while the reports list loads. */
export function ReportRowsSkeleton() {
	return (
		<div className="flex w-full flex-col gap-2">
			{ROW_KEYS.map((key) => (
				<Skeleton className="h-12 w-full rounded-md" key={key} />
			))}
		</div>
	);
}
