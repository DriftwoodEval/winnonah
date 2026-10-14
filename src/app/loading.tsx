import { ListSkeleton } from "@components/shared/ListSkeleton";

export default function Loading() {
	return (
		<div className="w-full p-4">
			<ListSkeleton rowClassName="h-10" rows={8} />
		</div>
	);
}
