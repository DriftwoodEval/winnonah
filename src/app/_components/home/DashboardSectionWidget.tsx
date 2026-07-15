"use client";

import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getHexFromColor, isClientColor } from "~/lib/colors";
import {
	type DashboardClient,
	SECTION_NEEDS_OUTREACH,
	SECTION_REACHED_OUT_NEEDS_REVIEW,
	SECTION_RECORDS_NEEDED_NOT_REQUESTED,
	SECTION_RECORDS_REQUESTED_NOT_RETURNED,
} from "~/lib/dashboard";
import type { Client, FullClientInfo } from "~/lib/models";
import { api } from "~/trpc/react";

interface DashboardSectionWidgetProps {
	sectionTitle: string;
}

export function DashboardSectionWidget({
	sectionTitle,
}: DashboardSectionWidgetProps) {
	const { data, isLoading } = api.google.getDashboardData.useQuery(undefined, {
		refetchInterval: 180000,
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2 p-3">
				<Skeleton className="h-4 w-1/2" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-3/4" />
			</div>
		);
	}

	const section = data?.sections.find((s) => s.title === sectionTitle);
	const rawClients = section?.clients ?? [];
	const clients =
		sectionTitle === SECTION_RECORDS_REQUESTED_NOT_RETURNED
			? rawClients.toSorted((a, b) => {
					const aDate =
						(a as FullClientInfo).externalRecordsRequestedDate ?? "";
					const bDate =
						(b as FullClientInfo).externalRecordsRequestedDate ?? "";
					return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
				})
			: rawClients;

	return (
		<div className="flex h-full flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
				<span className="font-medium text-sm">
					{sectionTitle}{" "}
					<span className="text-muted-foreground">({clients.length})</span>
				</span>
			</div>
			{clients.length === 0 ? (
				<p className="px-3 py-4 text-center text-muted-foreground text-sm">
					None
				</p>
			) : (
				<ul className="min-h-0 flex-1 divide-y overflow-auto">
					{clients.map((client) => (
						<DashboardClientRow
							client={client}
							key={client.id}
							sectionTitle={sectionTitle}
						/>
					))}
				</ul>
			)}
		</div>
	);
}

function DashboardClientRow({
	client,
	sectionTitle,
}: {
	client: DashboardClient;
	sectionTitle: string;
}) {
	const { data: session } = useSession();

	const full = client as FullClientInfo & DashboardClient;
	const bare = client as Client & DashboardClient;

	const name = full.fullName ?? full["Client Name"] ?? String(client.id);
	const hash = full.hash ?? "";
	const color = full.color;
	const language = full.language ?? full.Language;
	const extraInfo = full.extraInfo;

	const isOutreachSection =
		sectionTitle === SECTION_NEEDS_OUTREACH ||
		sectionTitle === SECTION_REACHED_OUT_NEEDS_REVIEW;
	const isRecordsNeededNotRequestedSection =
		sectionTitle === SECTION_RECORDS_NEEDED_NOT_REQUESTED;
	const isRecordsNotReturnedSection =
		sectionTitle === SECTION_RECORDS_REQUESTED_NOT_RETURNED;

	const showLanguage =
		(isOutreachSection || isRecordsNeededNotRequestedSection) &&
		language &&
		language.toLowerCase() !== "english";

	const claimedBy = bare.referralData?.outreachClaimedBy;
	const isClaimedByMe = claimedBy === session?.user?.name;

	const href = `/clients/${hash}${isOutreachSection ? "?tab=referral" : ""}`;

	return (
		<li>
			<Link
				className="flex items-start justify-between gap-2 px-3 py-1.5 text-sm hover:bg-muted/50"
				href={href}
			>
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="flex min-w-0 flex-wrap items-center gap-1.5">
						{color && isClientColor(color) && (
							<span
								className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: getHexFromColor(color) }}
							/>
						)}
						<span className="truncate">{name}</span>
						{showLanguage && (
							<span className="shrink-0 font-bold text-destructive text-xs">
								({language})
							</span>
						)}
						{claimedBy && (
							<span className="shrink-0 text-muted-foreground text-xs">
								{isClaimedByMe
									? "Claimed by you"
									: `Claimed by ${claimedBy.split(" ")[0]}`}
							</span>
						)}
						{isRecordsNotReturnedSection && full.evaluationInProcess && (
							<span className="shrink-0 rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">
								Eval In Process
							</span>
						)}
						{full.autismStop && (
							<span className="shrink-0 rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground">
								Autism Stop
							</span>
						)}
						{full.pause && (
							<span className="shrink-0 rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground">
								Paused
							</span>
						)}
						{full.failures?.map((f) => (
							<span
								className="shrink-0 rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
								key={f.reason}
							>
								{f.reason}
							</span>
						))}
					</span>
					{full.matchedSections && (
						<span className="text-muted-foreground text-xs">
							{full.matchedSections.join(", ")}
						</span>
					)}
				</span>
				{extraInfo && (
					<span className="mt-0.5 shrink-0 text-muted-foreground text-xs">
						{extraInfo}
					</span>
				)}
				{isRecordsNotReturnedSection && full.externalRecordsRequestedDate && (
					<span className="mt-0.5 shrink-0 text-muted-foreground text-xs">
						{format(new Date(full.externalRecordsRequestedDate), "MM/dd/yy")}
					</span>
				)}
			</Link>
		</li>
	);
}
