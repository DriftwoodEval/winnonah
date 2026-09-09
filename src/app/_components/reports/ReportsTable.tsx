"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import Link from "next/link";
import { toast } from "sonner";
import { formatInBusinessTime } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";

type Report = RouterOutputs["reports"]["list"][number];

// Statuses an approver can still approve & release from.
const APPROVABLE_STATUSES = ["claimed", "submitted"] as const;

const STATUS_LABELS: Partial<Record<Report["status"], string>> = {
	pending: "Awaiting folder",
};

// A linked writer shows their first name. When a report only carries an email
// that matches no user, fall back to the local part ("jane.doe@..." -> "Jane Doe").
function writerDisplay(
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

function statusLabel(status: Report["status"]) {
	return (
		STATUS_LABELS[status] ??
		`${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`
	);
}

// "claimed" covers two different situations: a pool report a writer actively
// took off the queue, and a self-written report that was pre-assigned to its
// evaluator at creation and never went through a claim step. Label them
// differently so "claimed" doesn't get used for reports nobody claimed.
function StatusBadge({
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

export function ReportsTable({
	reports,
	tab,
	isApprover,
}: {
	reports: Report[];
	tab: "active" | "archived";
	isApprover: boolean;
}) {
	const utils = api.useUtils();
	const { data: config } = api.reportQueue.getConfig.useQuery();
	const secondReview = config?.secondReviewLabel ?? "Second review";
	const billingFields = [
		{ key: "billed" as const, label: "Billed" },
		{
			key: "firstReviewDone" as const,
			label: config?.firstReviewLabel ?? "First review",
		},
		{ key: "secondReviewNeeded" as const, label: `${secondReview} needed` },
		{ key: "secondReviewDone" as const, label: `${secondReview} done` },
	];
	const invalidate = () => void utils.reports.list.invalidate();

	const markComplete = api.reports.markWriterComplete.useMutation({
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
	const setBilling = api.reports.setBillingField.useMutation({
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
	const approve = api.reports.approveAndRelease.useMutation({
		onSuccess: () => {
			invalidate();
			toast.success("Report approved and released.");
		},
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
	const archive = api.reports.archive.useMutation({
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
	const unarchive = api.reports.unarchive.useMutation({
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});

	if (reports.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				No reports to show.
			</p>
		);
	}

	return (
		<div className="w-full overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Client</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Eval date</TableHead>
						<TableHead>Writer</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Claimed on</TableHead>
						<TableHead>Writer done</TableHead>
						{billingFields.map((f) => (
							<TableHead key={f.key}>{f.label}</TableHead>
						))}
						{isApprover && <TableHead />}
					</TableRow>
				</TableHeader>
				<TableBody>
					{reports.map((r) => {
						const canEditWriting = r.isMine || isApprover;
						return (
							<TableRow key={r.id}>
								<TableCell>
									<Link
										className="text-sm hover:underline"
										href={`/clients/${r.clientHash}`}
									>
										{r.clientFullName}
									</Link>
								</TableCell>
								<TableCell className="whitespace-nowrap">
									{r.asdAdhd && <Badge variant="secondary">{r.asdAdhd}</Badge>}
									{r.selfWritten && (
										<Badge className="ml-1" variant="outline">
											self
										</Badge>
									)}
								</TableCell>
								<TableCell className="whitespace-nowrap text-sm">
									{r.evalAppointmentAt ? (
										formatInBusinessTime(r.evalAppointmentAt, "MMM d, yyyy")
									) : (
										<span className="text-muted-foreground text-xs">-</span>
									)}
								</TableCell>
								<TableCell className="whitespace-nowrap text-sm">
									{writerDisplay(r.writerName, r.writerEmail) ?? (
										<span className="text-muted-foreground">Unclaimed</span>
									)}
								</TableCell>
								<TableCell>
									<StatusBadge selfWritten={r.selfWritten} status={r.status} />
								</TableCell>
								<TableCell className="whitespace-nowrap text-sm">
									{r.claimedAt
										? formatInBusinessTime(r.claimedAt, "MMM d, yyyy")
										: "-"}
								</TableCell>
								<TableCell className="whitespace-nowrap">
									{r.writerCompletedAt ? (
										<div className="flex items-center gap-1">
											<span className="text-muted-foreground text-xs">
												{formatInBusinessTime(
													r.writerCompletedAt,
													"MMM d, yyyy",
												)}
											</span>
											{canEditWriting && (
												<Button
													onClick={() =>
														markComplete.mutate({ id: r.id, complete: false })
													}
													size="sm"
													variant="ghost"
												>
													Undo
												</Button>
											)}
										</div>
									) : canEditWriting ? (
										<Button
											onClick={() =>
												markComplete.mutate({ id: r.id, complete: true })
											}
											size="sm"
										>
											Mark done
										</Button>
									) : (
										<span className="text-muted-foreground text-xs">-</span>
									)}
								</TableCell>
								{billingFields.map((f) => (
									<TableCell key={f.key}>
										{r.canEditBilling ? (
											<Checkbox
												checked={r[f.key]}
												onCheckedChange={(v) =>
													setBilling.mutate({
														id: r.id,
														field: f.key,
														value: v === true,
													})
												}
											/>
										) : r[f.key] ? (
											<Badge variant="secondary">yes</Badge>
										) : (
											<span className="text-muted-foreground text-xs">-</span>
										)}
									</TableCell>
								))}
								{isApprover && (
									<TableCell className="whitespace-nowrap">
										{tab === "archived" ? (
											<Button
												onClick={() => unarchive.mutate({ id: r.id })}
												size="sm"
												variant="ghost"
											>
												Restore
											</Button>
										) : (
											<div className="flex items-center gap-1">
												{APPROVABLE_STATUSES.includes(
													r.status as (typeof APPROVABLE_STATUSES)[number],
												) && (
													<Button
														onClick={() => approve.mutate({ id: r.id })}
														size="sm"
													>
														Approve
													</Button>
												)}
												<Button
													onClick={() => archive.mutate({ id: r.id })}
													size="sm"
													variant="destructive"
												>
													Archive
												</Button>
											</div>
										)}
									</TableCell>
								)}
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
