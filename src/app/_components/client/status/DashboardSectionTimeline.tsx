"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn, sanitizeFailureReason } from "~/lib/utils";
import { api } from "~/trpc/react";

const FAILURE_PREFIX = "Failure: ";

function sectionTextClass(section: string): string {
	if (section.startsWith(FAILURE_PREFIX)) return "text-destructive";
	if (section.startsWith("Issue: ")) return "text-warning";
	return "text-muted-foreground";
}

// Failure sections are snapshotted verbatim into history at the time they
// occurred, so an old row can still carry a raw stack trace from before the
// reason was sanitized at the source. Clean it up at render time too.
function sectionDisplayText(section: string): string {
	if (!section.startsWith(FAILURE_PREFIX)) return section;
	return (
		FAILURE_PREFIX + sanitizeFailureReason(section.slice(FAILURE_PREFIX.length))
	);
}

export function DashboardSectionTimeline({ clientId }: { clientId: number }) {
	const { data: history, isLoading } =
		api.clients.getDashboardSectionHistory.useQuery(clientId, {
			refetchInterval: 60_000,
		});

	return (
		<Card className="w-full gap-1 rounded-md p-1">
			<CardHeader className="px-3 py-2">
				<CardTitle className="font-semibold text-sm">History</CardTitle>
			</CardHeader>
			<CardContent className="px-2 pb-2">
				{isLoading ? (
					<div className="space-y-1.5 px-1">
						<Skeleton className="h-3 w-3/4" />
						<Skeleton className="h-3 w-1/2" />
					</div>
				) : !history?.length ? (
					<p className="px-1 text-muted-foreground text-xs italic">
						No section history yet.
					</p>
				) : (
					<div className="relative ml-1 space-y-3 border-border border-l pl-3">
						{[...history].reverse().map((entry, i) => (
							<div className="relative" key={entry.id}>
								<span
									className={
										i === 0
											? "absolute top-1 -left-[17px] h-2 w-2 rounded-full bg-primary"
											: "absolute top-1 -left-[17px] h-2 w-2 rounded-full border-2 border-muted-foreground bg-background"
									}
								/>
								<p className="font-medium text-sm leading-tight">
									{format(entry.createdAt, "PPp")}{" "}
									<span className="font-normal text-muted-foreground">
										(
										{formatDistanceToNowStrict(entry.createdAt, {
											addSuffix: true,
										})}
										)
									</span>
								</p>
								{entry.sections.length === 0 ? (
									<p className="text-muted-foreground text-xs italic leading-tight">
										No matching section
									</p>
								) : (
									entry.sections.map((section) => (
										<p
											className={cn(
												"text-xs leading-tight",
												sectionTextClass(section),
											)}
											key={section}
										>
											{sectionDisplayText(section)}
										</p>
									))
								)}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
