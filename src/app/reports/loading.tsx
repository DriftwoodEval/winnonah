import { ReportRowsSkeleton } from "@components/reports/ReportRowsSkeleton";

// Mirrors the page shell and ReportsView's own loading state, so nothing shifts
// when the page renders.
export default function Loading() {
	return (
		<div className="flex grow flex-col gap-4 px-4 py-6">
			<div className="flex w-full flex-col gap-4">
				<h1 className="font-semibold text-xl">Reports</h1>
				<ReportRowsSkeleton />
			</div>
		</div>
	);
}
