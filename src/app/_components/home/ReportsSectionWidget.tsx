"use client";

import { useReportSectionsQuery } from "@components/dashboard/ReportsDashboardSections";
import { SectionReportCard } from "@components/reports/ReportCards";
import { ReportsLegend } from "@components/reports/report-shared";
import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
import { Skeleton } from "@ui/skeleton";

export function ReportsSectionWidget({ sectionId }: { sectionId: string }) {
	const { sections, isError, refetch } = useReportSectionsQuery();
	const section = sections?.find((s) => s.id === sectionId);

	if (isError) return <ErrorState compact onRetry={refetch} />;

	if (!section) {
		return (
			<div className="flex flex-col gap-2 p-3">
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-3/4" />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
				{section.title}{" "}
				<span className="text-muted-foreground">
					({section.reports.length})
				</span>
			</div>
			{section.reports.length === 0 ? (
				<EmptyState compact title="No reports in this list" />
			) : (
				<ul className="min-h-0 flex-1 overflow-auto">
					{section.reports.map((r) => (
						<li key={r.id}>
							<SectionReportCard
								className="m-2"
								doneField={section.doneField}
								doneLabel={section.doneLabel}
								report={r}
							/>
						</li>
					))}
				</ul>
			)}
			<details className="shrink-0 border-t p-2 text-xs">
				<summary className="cursor-pointer text-muted-foreground">
					Legend
				</summary>
				<ReportsLegend />
			</details>
		</div>
	);
}
