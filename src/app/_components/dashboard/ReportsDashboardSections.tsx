"use client";

import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { MapIcon, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { usePersistedScroll } from "~/hooks/use-persisted-scroll";
import { getHexFromColor } from "~/lib/colors";
import { canAccessReportsBeta, formatCurrency } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { ErrorState } from "../shared/ErrorState";
import {
	DismissButton,
	DismissedBadge,
	HideDismissedToggle,
	useListDismissals,
} from "./ListDismissals";

type Report = RouterOutputs["reports"]["list"][number];

export interface ReportSection {
	id: string;
	title: string;
	reports: Report[];
}

/**
 * One list per column on the Reports page: the active reports still waiting on
 * that step. `sections` is null until loaded, when the load failed, and for
 * users who cannot open the Reports (beta) page. `isError` and `refetch`
 * describe the reports query.
 */
export function useReportSectionsQuery(): {
	sections: ReportSection[] | null;
	isError: boolean;
	refetch: () => void;
} {
	const { data: session } = useSession();
	const enabled = !!session?.user && canAccessReportsBeta(session.user);
	const {
		data: reports,
		isError,
		refetch,
	} = api.reports.list.useQuery(
		{ tab: "active", kind: "all" },
		{ enabled, refetchInterval: 180000 },
	);
	const { data: config } = api.reportQueue.getConfig.useQuery(undefined, {
		enabled,
	});

	if (!enabled || !reports) return { sections: null, isError, refetch };

	const secondReview = config?.secondReviewLabel ?? "Second review";
	const firstReview = config?.firstReviewLabel ?? "First review";
	// Reports still in the claim queue have no writer yet, so they are not
	// waiting on any of these steps.
	const inProgress = reports.filter(
		(r) => r.status !== "pending" && r.status !== "queued",
	);
	const sections: {
		id: string;
		title: string;
		matches: (r: Report) => boolean;
	}[] = [
		{
			id: "writer",
			title: "Writer not done",
			matches: (r) => !r.writerCompletedAt,
		},
		{
			id: "second-review",
			title: `${secondReview} needed`,
			matches: (r) => r.secondReviewNeeded && !r.secondReviewDone,
		},
		{
			id: "first-review",
			title: `${firstReview} not done`,
			matches: (r) => !!r.writerCompletedAt && !r.firstReviewDone,
		},
		{ id: "billing", title: "Not billed", matches: (r) => !r.billed },
	];
	return {
		sections: sections.map(({ id, title, matches }) => ({
			id,
			title,
			reports: inProgress.filter(matches),
		})),
		isError,
		refetch,
	};
}

function ReportSectionItem({ id, title, reports: allReports }: ReportSection) {
	const utils = api.useUtils();
	const dismissals = useListDismissals(
		`reports-${id}`,
		allReports.map((r) => r.clientId),
	);
	const reports = dismissals.filterVisible(allReports, (r) => r.clientId);
	const savedClientRef = useRef<HTMLDivElement>(null);
	const persistScrollRef = usePersistedScroll(
		`dashboard-section:reports-${id}`,
	);
	const savedPlaceKey = `reports-${id}`;

	const { data: savedPlaces } = api.users.getSavedPlaces.useQuery();
	const savedPlaceData = savedPlaces?.[savedPlaceKey];
	const savedPlaceHash = savedPlaceData?.hash;
	const savedPlaceIndex = savedPlaceData?.index;

	const { mutate: updateSavedPlace } = api.users.updateSavedPlaces.useMutation({
		onSuccess: () => utils.users.getSavedPlaces.invalidate(),
	});
	const { mutate: deleteSavedPlace } = api.users.deleteSavedPlace.useMutation({
		onSuccess: () => utils.users.getSavedPlaces.invalidate(),
	});

	// If the saved client left this list, move the saved place to the report now
	// at (or just before) its old position.
	useEffect(() => {
		if (!savedPlaceHash || reports.length === 0) return;
		if (reports.some((r) => r.clientHash === savedPlaceHash)) return;

		const fallbackIndex =
			savedPlaceIndex !== undefined
				? Math.min(savedPlaceIndex - 1, reports.length - 1)
				: 0;
		const fallback = reports[fallbackIndex];
		if (fallback) {
			updateSavedPlace({
				key: savedPlaceKey,
				clientId: fallback.clientId,
				hash: fallback.clientHash,
				index: fallbackIndex,
			});
		}
	}, [
		reports,
		savedPlaceKey,
		savedPlaceHash,
		savedPlaceIndex,
		updateSavedPlace,
	]);

	return (
		<AccordionItem value={title}>
			<AccordionTrigger>
				<span className="flex items-center gap-1">
					{title}
					<span className="text-muted-foreground text-sm">
						({reports.length})
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent>
				<HideDismissedToggle dismissals={dismissals} />
				{savedPlaceHash && (
					<div className="mb-2 flex justify-end">
						<Button
							aria-label="Scroll to saved client"
							className="font-medium text-muted-foreground text-xs"
							onClick={() =>
								savedClientRef.current?.scrollIntoView({ behavior: "smooth" })
							}
							size="sm"
							type="button"
							variant="ghost"
						>
							<MapIcon className="h-3 w-3" />
							<span>Go to saved</span>
						</Button>
					</div>
				)}
				<ScrollArea
					className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow-sm"
					viewportRef={persistScrollRef}
				>
					<div className="p-4">
						{reports.map((r, index) => {
							const isSaved = savedPlaceHash === r.clientHash;
							return (
								<div
									className="scroll-mt-12"
									key={r.id}
									ref={isSaved ? savedClientRef : null}
								>
									<div className="flex items-center justify-between gap-2">
										<Link
											className="no-underline! hover:no-underline! flex grow flex-wrap items-center gap-2"
											href={`/clients/${r.clientHash}`}
										>
											<span
												className="h-3 w-3 shrink-0 rounded-full"
												style={{
													backgroundColor: getHexFromColor(r.clientColor),
												}}
											/>
											<span>
												<Redact>{r.clientFullName}</Redact>
											</span>
											{r.clientAutismStop && (
												<Badge className="" size="sm" variant="destructive">
													Autism Stop
												</Badge>
											)}
											{r.clientPause && (
												<Badge className="" size="sm" variant="destructive">
													Paused
												</Badge>
											)}
											{r.clientOutstandingBalance > 0 && (
												<Badge className="" size="sm" variant="destructive">
													{formatCurrency(r.clientOutstandingBalance)} due
												</Badge>
											)}
											{dismissals.isDismissed(r.clientId) && (
												<DismissedBadge note={dismissals.noteFor(r.clientId)} />
											)}
										</Link>
										<DismissButton
											clientId={r.clientId}
											dismissals={dismissals}
										/>
									</div>
									{isSaved ? (
										<button
											aria-label={`Remove ${r.clientFullName} as saved client for ${title}`}
											className="group relative flex w-full cursor-pointer items-center py-2"
											onClick={() => deleteSavedPlace({ key: savedPlaceKey })}
											type="button"
										>
											<Separator className="my-2 flex-1 rounded bg-secondary data-[orientation=horizontal]:h-1" />
											<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
												<PinOff className="h-4 w-4" />
											</div>
										</button>
									) : (
										index < reports.length - 1 && (
											<button
												aria-label={`Set ${r.clientFullName} as saved client for ${title}`}
												className="group relative flex w-full cursor-pointer items-center py-2"
												onClick={() =>
													updateSavedPlace({
														key: savedPlaceKey,
														clientId: r.clientId,
														hash: r.clientHash,
														index,
													})
												}
												type="button"
											>
												<Separator className="flex-1" />
												<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
													<Pin className="h-4 w-4" />
												</div>
											</button>
										)
									)}
								</div>
							);
						})}
					</div>
				</ScrollArea>
			</AccordionContent>
		</AccordionItem>
	);
}

/** The dashboard's Reports lists. Rendered inside the dashboard's Accordion. */
export function ReportsDashboardSections() {
	const { sections, isError, refetch } = useReportSectionsQuery();
	if (!sections && !isError) return null;

	return (
		<>
			<h2 className="mt-6 mb-2 self-start font-bold text-lg">Reports</h2>
			{sections ? (
				sections.map((section) => (
					<ReportSectionItem key={section.id} {...section} />
				))
			) : (
				<ErrorState compact onRetry={refetch} />
			)}
		</>
	);
}
