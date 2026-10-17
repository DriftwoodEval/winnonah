"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { formatInBusinessTime } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";

export type Report = RouterOutputs["reports"]["list"][number];

// Statuses an approver can still approve & release from.
const APPROVABLE_STATUSES = ["claimed", "submitted"] as const;

// A report can only be approved once the writer has marked it done.
export function canApprove(r: Report) {
	return (
		r.writerCompletedAt !== null &&
		APPROVABLE_STATUSES.includes(
			r.status as (typeof APPROVABLE_STATUSES)[number],
		)
	);
}

export const STATUS_LABELS: Partial<Record<Report["status"], string>> = {
	pending: "Awaiting folder",
};

// A linked writer shows their first name. When a report only carries an email
// that matches no user, fall back to the local part ("jane.doe@..." -> "Jane Doe").
export function writerDisplay(
	name: string | null | undefined,
	email: string | null | undefined,
) {
	if (name) return name.split(" ")[0] ?? name;
	if (!email) return null;
	const local = email.split("@")[0] ?? "";
	const guess = local
		.split(/[._-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
	return guess || null;
}

export function LegendItem({
	sample,
	description,
}: {
	sample: ReactNode;
	description: string;
}) {
	return (
		<div className="flex items-center gap-2">
			{sample}
			<span className="text-muted-foreground">{description}</span>
		</div>
	);
}

// Dates in the current year drop the year to save column width.
export function formatReportDate(date: Date) {
	const sameYear =
		formatInBusinessTime(date, "yyyy") ===
		formatInBusinessTime(new Date(), "yyyy");
	return formatInBusinessTime(date, sameYear ? "MMM d" : "MMM d, yyyy");
}

// Rows for Beth's evals are shown in bold.
export function isBethEvaluator(providerName: string | null) {
	return providerName?.split(" ")[0]?.toLowerCase() === "beth";
}

export function statusLabel(status: Report["status"]) {
	return (
		STATUS_LABELS[status] ??
		`${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`
	);
}

// "claimed" covers two different situations: a pool report a writer actively
// took off the queue, and a self-written report that was pre-assigned to its
// evaluator at creation and never went through a claim step. Label them
// differently so "claimed" doesn't get used for reports nobody claimed.
export function StatusBadge({
	status,
	selfWritten,
}: {
	status: Report["status"];
	selfWritten: boolean;
}) {
	switch (status) {
		case "pending":
			return <Badge variant="outline">{statusLabel(status)}</Badge>;
		case "queued":
			return (
				<Badge className="border-warning/40 text-warning" variant="outline">
					In queue
				</Badge>
			);
		case "claimed":
			return (
				<Badge variant="secondary">{selfWritten ? "Writing" : "Claimed"}</Badge>
			);
		case "approved":
			return (
				<Badge className="border-success/40 text-success" variant="outline">
					Approved
				</Badge>
			);
		default:
			return <Badge variant="secondary">{statusLabel(status)}</Badge>;
	}
}

// Explains the row styling shared by the Reports page and the dashboard sections.
export function ReportsLegend() {
	return (
		<div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
			<LegendItem
				description="Beth's eval"
				sample={<span className="font-bold">Bold</span>}
			/>
			<LegendItem
				description="Inactive client"
				sample={<span className="opacity-50">Grayed out</span>}
			/>
			<LegendItem
				description="Client has an outstanding balance"
				sample={
					<span className="rounded bg-destructive/15 px-1.5">Red row</span>
				}
			/>
			<LegendItem
				description="Evaluator writes their own report"
				sample={<Badge variant="outline">self</Badge>}
			/>
			<LegendItem
				description="A writer took it from the queue"
				sample={<Badge variant="secondary">Claimed</Badge>}
			/>
			<LegendItem
				description="Self-written report in progress"
				sample={<Badge variant="secondary">Writing</Badge>}
			/>
			<LegendItem
				description="Report approved, writer can take another from the queue"
				sample={<StatusBadge selfWritten={false} status="approved" />}
			/>
		</div>
	);
}

// Every report action, refreshing the report lists on success.
export function useReportMutations() {
	const utils = api.useUtils();
	const options = {
		onSuccess: () => void utils.reports.list.invalidate(),
		onError: (e: { message: string }) =>
			toast.error("Failed", { description: e.message }),
	};
	return {
		markComplete: api.reports.markWriterComplete.useMutation(options),
		setBilling: api.reports.setBillingField.useMutation(options),
		approve: api.reports.approveAndRelease.useMutation(options),
		unapprove: api.reports.unapprove.useMutation(options),
		archive: api.reports.archive.useMutation(options),
		unarchive: api.reports.unarchive.useMutation(options),
		confirmWriter: api.reports.confirmWriter.useMutation(options),
	};
}

// Opens the client's Google Drive folder in a new tab; hovering loads and
// shows the folder's full path. Renders nothing when no folder is linked.
export function ClientDriveLink({ report: r }: { report: Report }) {
	const [hovered, setHovered] = useState(false);
	const { data: drive } = api.reports.clientDrivePath.useQuery(
		{ clientId: r.clientId },
		{ enabled: hovered, staleTime: Number.POSITIVE_INFINITY },
	);
	if (!r.clientDriveId || r.clientDriveId === "N/A") return null;
	return (
		<a
			className="inline-flex shrink-0"
			href={`https://drive.google.com/open?id=${r.clientDriveId}`}
			onFocus={() => setHovered(true)}
			onMouseEnter={() => setHovered(true)}
			rel="noreferrer"
			target="_blank"
			title={drive?.path ?? `Open ${r.clientFullName}'s Drive folder`}
		>
			<Image
				alt="Open Google Drive folder"
				className="dark:invert"
				height={14}
				src="/icons/google-drive.svg"
				width={14}
			/>
		</a>
	);
}

// The report's writer. With no writer, approvers see the writer inferred from
// the client's Drive folder with a button to confirm it; nothing is saved until
// they do.
export function WriterCell({ report: r }: { report: Report }) {
	const { confirmWriter } = useReportMutations();
	const writer = writerDisplay(r.writerName, r.writerEmail);
	const { data: drive } = api.reports.clientDrivePath.useQuery(
		{ clientId: r.clientId },
		{
			enabled: !writer && r.canEditBilling,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
	if (writer) return <>{writer}</>;
	const suggested = drive?.inferredWriter;
	if (!suggested)
		return <span className="text-muted-foreground">Unclaimed</span>;
	return (
		<span className="inline-flex flex-col items-start gap-0.5">
			<span className="text-muted-foreground text-xs italic">
				Likely {writerDisplay(suggested.name, suggested.email)}
			</span>
			<Button
				disabled={confirmWriter.isPending}
				onClick={() =>
					confirmWriter.mutate({ id: r.id, writerUserId: suggested.id })
				}
				size="xs"
			>
				Confirm writer
			</Button>
		</span>
	);
}
