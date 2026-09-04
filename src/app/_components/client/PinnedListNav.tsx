"use client";

import { Button } from "@ui/button";
import { ChevronDown, ChevronLeft, ChevronRight, Pin, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePinnedListNav } from "~/hooks/use-pinned-list";
import { getHexFromColor, isClientColor } from "~/lib/colors";
import type { PinnedListEntry } from "~/lib/pinned-list";
import { Redact } from "../redaction/Redact";

function entryHref(entry: PinnedListEntry): string {
	return `/clients/${entry.hash}${entry.tab ? `?tab=${entry.tab}` : ""}`;
}

function ExpandedRow({
	entry,
	position,
	current,
}: {
	entry: PinnedListEntry;
	position: number;
	current: boolean;
}) {
	const hasSubline = entry.meta.length > 0 || !!entry.danger;

	return (
		<Link
			className={`no-underline! hover:no-underline! block px-3 py-1.5 text-foreground hover:bg-muted ${
				current ? "bg-muted" : ""
			}`}
			href={entryHref(entry)}
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<span className="w-6 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
					{position}
				</span>
				{entry.color && isClientColor(entry.color) && (
					<span
						className="h-2.5 w-2.5 shrink-0 rounded-full"
						style={{ backgroundColor: getHexFromColor(entry.color) }}
					/>
				)}
				<span className={current ? "font-medium" : ""}>
					<Redact>{entry.name}</Redact>
				</span>
				{entry.waiting && (
					<span className="rounded-sm bg-warning px-1 py-0.5 text-[10px] text-warning-foreground">
						Waiting
					</span>
				)}
				{entry.chips.map((chip) => (
					<span
						className="rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
						key={chip}
					>
						{chip}
					</span>
				))}
			</div>
			{hasSubline && (
				<div className="pl-8 text-muted-foreground text-xs">
					{entry.meta.join(" · ")}
					{entry.danger && (
						<span className="text-destructive">
							{entry.meta.length > 0 ? " · " : ""}
							{entry.danger}
						</span>
					)}
				</div>
			)}
		</Link>
	);
}

/**
 * Prev/next bar shown on a client page when the user has pinned a list on the
 * dashboard and this client is being walked through it. Click the label to
 * expand the whole list, with the same badges and notes the dashboard shows.
 */
export function PinnedListNav({ clientHash }: { clientHash: string }) {
	const {
		pinned,
		label,
		entries,
		onList,
		index,
		total,
		prev,
		next,
		clearPinned,
		insuranceFilters,
		setInsuranceFilter,
		clearInsuranceFilters,
	} = usePinnedListNav(clientHash);
	const [expanded, setExpanded] = useState(false);

	if (!label) return null;

	const isInsurance = pinned?.kind === "insuranceReview";
	const mineOn = insuranceFilters.includes("mine");
	const waitingOn = insuranceFilters.includes("waiting");
	const filtered = mineOn || waitingOn;

	return (
		<div className="w-full rounded-md border bg-card text-sm">
			<div className="flex items-center gap-2 px-3 py-1.5">
				<Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<button
					className="flex min-w-0 items-center gap-1 font-medium"
					onClick={() => setExpanded((v) => !v)}
					type="button"
				>
					<span className="truncate">{label}</span>
					<ChevronDown
						className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
							expanded ? "rotate-180" : ""
						}`}
					/>
				</button>
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{onList ? `${index + 1} / ${total}` : `not on list · ${total}`}
				</span>
				<Button
					aria-label="Unpin list"
					className="shrink-0"
					onClick={clearPinned}
					size="icon-sm"
					variant="ghost"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
			{isInsurance && (
				<div className="flex items-center gap-2 border-t px-3 py-1.5 text-xs">
					<span className="text-muted-foreground">
						{filtered ? "Filtered:" : "Filter:"}
					</span>
					<button
						className={`rounded-sm px-1.5 py-0.5 ${
							mineOn
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground"
						}`}
						onClick={() => setInsuranceFilter("mine", !mineOn)}
						type="button"
					>
						Mine
					</button>
					<button
						className={`rounded-sm px-1.5 py-0.5 ${
							waitingOn
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground"
						}`}
						onClick={() => setInsuranceFilter("waiting", !waitingOn)}
						type="button"
					>
						Waiting
					</button>
					{filtered && (
						<button
							className="ml-auto text-muted-foreground underline"
							onClick={clearInsuranceFilters}
							type="button"
						>
							Clear
						</button>
					)}
				</div>
			)}
			{onList && (
				<div className="flex gap-1 border-t px-2 py-1">
					{prev ? (
						<Button asChild className="flex-1" size="sm" variant="ghost">
							<Link href={entryHref(prev)}>
								<ChevronLeft className="h-4 w-4" />
								Prev
							</Link>
						</Button>
					) : (
						<span className="flex flex-1 items-center justify-center gap-1 py-1.5 text-muted-foreground text-xs">
							<ChevronLeft className="h-4 w-4" />
							Prev
						</span>
					)}
					{next ? (
						<Button asChild className="flex-1" size="sm" variant="ghost">
							<Link href={entryHref(next)}>
								Next
								<ChevronRight className="h-4 w-4" />
							</Link>
						</Button>
					) : (
						<span className="flex flex-1 items-center justify-center gap-1 py-1.5 text-muted-foreground text-xs">
							Next
							<ChevronRight className="h-4 w-4" />
						</span>
					)}
				</div>
			)}
			{expanded && (
				<ol className="max-h-72 divide-y overflow-y-auto border-t">
					{entries.map((entry, i) => (
						<li key={entry.hash}>
							<ExpandedRow
								current={entry.hash === clientHash}
								entry={entry}
								position={i + 1}
							/>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
