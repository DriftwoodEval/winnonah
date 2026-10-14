import { TableSkeleton } from "@components/shared/ListSkeleton";

export default function Loading() {
	return (
		<div className="w-full p-4">
			<TableSkeleton />
		</div>
	);
}
