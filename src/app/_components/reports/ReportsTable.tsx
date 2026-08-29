"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
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

const WRITING_STATUSES = ["claimed", "writing", "submitted"] as const;

function StatusBadge({ status }: { status: Report["status"] }) {
	return <Badge variant="secondary">{status}</Badge>;
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
	const billingFields = [
		{ key: "billed" as const, label: "Billed" },
		{
			key: "ajpReviewDone" as const,
			label: config?.firstReviewLabel ?? "Review 1",
		},
		{
			key: "mcsReviewNeeded" as const,
			label: config?.secondReviewLabel ?? "Review 2",
		},
		{ key: "bridgesBilled" as const, label: "BRIDGES billed" },
	];
	const invalidate = () => void utils.reports.list.invalidate();

	const setStatus = api.reports.setWritingStatus.useMutation({
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
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
						<TableHead>Writer</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Claimed</TableHead>
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
									{r.writerName ?? r.writerEmail ?? (
										<span className="text-muted-foreground">Unclaimed</span>
									)}
								</TableCell>
								<TableCell>
									{canEditWriting && r.status !== "approved" ? (
										<Select
											onValueChange={(v) =>
												setStatus.mutate({
													id: r.id,
													status: v as (typeof WRITING_STATUSES)[number],
												})
											}
											value={
												WRITING_STATUSES.includes(
													r.status as (typeof WRITING_STATUSES)[number],
												)
													? r.status
													: undefined
											}
										>
											<SelectTrigger className="h-8 w-[120px]">
												<SelectValue placeholder={r.status} />
											</SelectTrigger>
											<SelectContent>
												{WRITING_STATUSES.map((s) => (
													<SelectItem key={s} value={s}>
														{s}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									) : (
										<StatusBadge status={r.status} />
									)}
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
												{formatInBusinessTime(r.writerCompletedAt, "MMM d")}
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
											variant="outline"
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
												{r.status === "submitted" && (
													<Button
														onClick={() => approve.mutate({ id: r.id })}
														size="sm"
														variant="outline"
													>
														Approve
													</Button>
												)}
												<Button
													onClick={() => archive.mutate({ id: r.id })}
													size="sm"
													variant="ghost"
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
