"use client";

import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import Link from "next/link";
import { getHexFromColor } from "~/lib/colors";
import { formatCurrency } from "~/lib/utils";
import { useReportSectionsQuery } from "../dashboard/ReportsDashboardSections";
import { Redact } from "../redaction/Redact";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";

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
			<div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 font-medium text-sm">
				{section.title}{" "}
				<span className="text-muted-foreground">
					({section.reports.length})
				</span>
			</div>
			{section.reports.length === 0 ? (
				<EmptyState compact title="No reports in this list" />
			) : (
				<ul className="min-h-0 flex-1 divide-y overflow-auto">
					{section.reports.map((r) => (
						<li key={r.id}>
							<Link
								className="flex items-start justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
								href={`/clients/${r.clientHash}`}
							>
								<span className="flex min-w-0 flex-wrap items-center gap-1.5">
									<span
										className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: getHexFromColor(r.clientColor) }}
									/>
									<span className="truncate">
										<Redact>{r.clientFullName}</Redact>
									</span>
									{r.clientAutismStop && (
										<Badge className="shrink-0" size="sm" variant="warning">
											Autism Stop
										</Badge>
									)}
									{r.clientPause && (
										<Badge className="shrink-0" size="sm" variant="warning">
											Paused
										</Badge>
									)}
									{r.clientOutstandingBalance > 0 && (
										<Badge className="shrink-0" size="sm" variant="destructive">
											{formatCurrency(r.clientOutstandingBalance)} due
										</Badge>
									)}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
