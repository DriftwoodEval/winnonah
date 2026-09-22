"use client";

import {
	ColumnFilter,
	type FilterOption,
	toFilterOptions,
} from "@components/shared/ColumnFilter";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Input } from "@ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn, formatInBusinessTime } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { ReportNoteCell } from "./ReportNoteCell";

type Report = RouterOutputs["reports"]["list"][number];

// Statuses an approver can still approve & release from.
const APPROVABLE_STATUSES = ["claimed", "submitted"] as const;

const STATUS_LABELS: Partial<Record<Report["status"], string>> = {
	pending: "Awaiting folder",
};

interface SavedFilters {
	status: string[];
	writer: string[];
	type: string[];
	evaluator: string[];
	writerDone: string[];
	secondReviewNeeded: string[];
	secondReviewDone: string[];
	billed: string[];
	firstReviewDone: string[];
}

type FilterKey = keyof SavedFilters;

// Headers wrap onto several lines and hug the bottom edge, so short labels
// leave the spare room above them.
const HEAD_CLASS = "h-auto whitespace-normal align-bottom py-2";

const EMPTY_FILTERS: SavedFilters = {
	status: [],
	writer: [],
	type: [],
	evaluator: [],
	writerDone: [],
	secondReviewNeeded: [],
	secondReviewDone: [],
	billed: [],
	firstReviewDone: [],
};
const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as FilterKey[];

interface SavedView {
	name: string;
	filters: SavedFilters;
}

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

// Rows for Beth's evals are shown in bold.
function isBethEvaluator(providerName: string | null) {
	return providerName?.split(" ")[0]?.toLowerCase() === "beth";
}

// The text a report shows for a filterable column; filter options are the
// distinct values and a row passes when its value is among the selected ones.
function filterValue(r: Report, key: FilterKey) {
	switch (key) {
		case "status":
			return statusLabel(r.status);
		case "writer":
			return writerDisplay(r.writerName, r.writerEmail) ?? "Unclaimed";
		case "type":
			return r.asdAdhd ?? "None";
		case "evaluator":
			return r.evalEvaluatorName ?? "None";
		case "writerDone":
			return r.writerCompletedAt ? "Yes" : "No";
		default:
			return r[key] ? "Yes" : "No";
	}
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
	// Order matters here: it drives both the header row and each row's cells.
	// secondReview* sits right after "Writer done" and before "Billed".
	const billingFields = [
		{ key: "secondReviewNeeded" as const, label: `${secondReview} needed` },
		{ key: "secondReviewDone" as const, label: `${secondReview} done` },
		{ key: "billed" as const, label: "Billed" },
		{
			key: "firstReviewDone" as const,
			label: config?.firstReviewLabel ?? "First review",
		},
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
		onSuccess: invalidate,
		onError: (e) => toast.error("Failed", { description: e.message }),
	});
	const unapprove = api.reports.unapprove.useMutation({
		onSuccess: invalidate,
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

	// --- Column filters + saved views -------------------------------------
	const [filters, setFilters] = useState<SavedFilters>(EMPTY_FILTERS);
	const { data: savedFilters } = api.sessions.getReportsFilters.useQuery();
	const saveFilters = api.sessions.saveReportsFilters.useMutation();
	const views: SavedView[] = useMemo(() => {
		if (!savedFilters?.reportsFilters) return [];
		try {
			const parsed = JSON.parse(savedFilters.reportsFilters) as {
				views?: SavedView[];
			};
			return parsed.views ?? [];
		} catch {
			return [];
		}
	}, [savedFilters]);
	const [newViewName, setNewViewName] = useState("");

	function persistViews(next: SavedView[]) {
		saveFilters.mutate({ reportsFilters: JSON.stringify({ views: next }) });
	}

	function saveCurrentView() {
		const name = newViewName.trim();
		if (!name) return;
		const next = [...views.filter((v) => v.name !== name), { name, filters }];
		persistViews(next);
		setNewViewName("");
		toast.success(`Saved filter "${name}".`);
	}

	function deleteView(name: string) {
		persistViews(views.filter((v) => v.name !== name));
	}

	const hasActiveFilters = Object.values(filters).some((v) => v.length > 0);

	function filterOptions(key: FilterKey): FilterOption[] {
		return toFilterOptions(
			[...new Set(reports.map((r) => filterValue(r, key)))].sort(),
		);
	}

	const filteredReports = reports.filter((r) =>
		FILTER_KEYS.every(
			(key) =>
				filters[key].length === 0 || filters[key].includes(filterValue(r, key)),
		),
	);

	function filterHead(key: FilterKey, label: string) {
		return (
			<TableHead className={HEAD_CLASS} key={key}>
				<div className="flex items-end gap-1">
					{label}
					<ColumnFilter
						columnName={label}
						onFilterChange={(v) => setFilters((f) => ({ ...f, [key]: v }))}
						options={filterOptions(key)}
						selectedValues={filters[key]}
					/>
				</div>
			</TableHead>
		);
	}

	// --- Bulk selection + actions -------------------------------------------
	// In select mode, clicking anywhere on a row toggles it.
	const [selectMode, setSelectMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const visibleIds = filteredReports.map((r) => r.id);
	const allSelected =
		visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
	const someSelected = visibleIds.some((id) => selectedIds.has(id));

	function toggleSelectMode() {
		setSelectMode((on) => !on);
		setSelectedIds(new Set());
	}
	function toggleAll(checked: boolean) {
		setSelectedIds(checked ? new Set(visibleIds) : new Set());
	}
	// Buttons, checkboxes, and inputs inside a row keep their own behavior;
	// anything else, including the client link, selects the row. Clicks inside
	// popovers bubble through React from outside the row's DOM, so skip those.
	function onRowClick(e: React.MouseEvent, id: number) {
		const target = e.target as HTMLElement;
		if (
			!selectMode ||
			!e.currentTarget.contains(target) ||
			target.closest("button, input")
		)
			return;
		e.preventDefault();
		toggleOne(id);
	}
	function toggleOne(id: number) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const bulkCheckboxFields = [
		{ field: "writerCompletedAt" as const, label: "Writer done" },
		...billingFields.map((f) => ({ field: f.key, label: f.label })),
	];
	type BulkCheckboxField = (typeof bulkCheckboxFields)[number]["field"];
	type BulkAction =
		| "approve"
		| "archive"
		| { field: BulkCheckboxField; value: boolean };

	async function applyBulkAction(action: BulkAction) {
		const selected = filteredReports.filter((r) => selectedIds.has(r.id));
		if (selected.length === 0) return;

		const results = await Promise.allSettled(
			selected.map((r) => {
				if (action === "approve") {
					if (
						!APPROVABLE_STATUSES.includes(
							r.status as (typeof APPROVABLE_STATUSES)[number],
						)
					)
						return Promise.resolve();
					return approve.mutateAsync({ id: r.id });
				}
				if (action === "archive") return archive.mutateAsync({ id: r.id });
				if (action.field === "writerCompletedAt")
					return markComplete.mutateAsync({ id: r.id, complete: action.value });
				return setBilling.mutateAsync({
					id: r.id,
					field: action.field,
					value: action.value,
				});
			}),
		);
		const failed = results.filter((r) => r.status === "rejected").length;
		if (failed > 0) {
			toast.error(`${failed} of ${selected.length} failed.`);
		} else {
			toast.success(
				`Updated ${selected.length} report${selected.length === 1 ? "" : "s"}.`,
			);
		}
		setSelectedIds(new Set());
	}

	if (reports.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				No reports to show.
			</p>
		);
	}

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-muted-foreground text-sm">
					Showing {filteredReports.length} of {reports.length} report
					{reports.length === 1 ? "" : "s"}
				</span>
				<div className="flex items-center gap-2">
					{isApprover && (
						<Button
							onClick={toggleSelectMode}
							size="sm"
							variant={selectMode ? "default" : "outline"}
						>
							{selectMode ? "Done selecting" : "Select"}
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" variant="outline">
								Saved filters <ChevronDown className="ml-1 h-3.5 w-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-64">
							{views.length === 0 && (
								<div className="p-2 text-muted-foreground text-sm">
									No saved filters yet
								</div>
							)}
							{views.map((v) => (
								<div
									className="flex items-center justify-between px-2 py-1"
									key={v.name}
								>
									<button
										className="flex-1 text-left text-sm hover:underline"
										onClick={() =>
											setFilters({ ...EMPTY_FILTERS, ...v.filters })
										}
										type="button"
									>
										{v.name}
									</button>
									<Button
										onClick={() => deleteView(v.name)}
										size="sm"
										variant="ghost"
									>
										Delete
									</Button>
								</div>
							))}
							<DropdownMenuSeparator />
							<div className="flex items-center gap-1 p-2">
								<Input
									className="h-8"
									onChange={(e) => setNewViewName(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
									placeholder="Save current filters as..."
									value={newViewName}
								/>
								<Button onClick={saveCurrentView} size="sm">
									Save
								</Button>
							</div>
							{hasActiveFilters && (
								<DropdownMenuItem
									className="justify-center text-destructive"
									onClick={() => setFilters(EMPTY_FILTERS)}
								>
									Clear all filters
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{isApprover && selectMode && (
				<div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 p-2">
					<span className="text-sm">
						{selectedIds.size > 0
							? `${selectedIds.size} selected`
							: "Click rows to select them"}
					</span>
					<Button
						onClick={() => toggleAll(!allSelected)}
						size="sm"
						variant="outline"
					>
						{allSelected ? "Deselect all" : "Select all"}
					</Button>
					{someSelected && (
						<>
							<Button onClick={() => applyBulkAction("approve")} size="sm">
								Approve
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="sm" variant="outline">
										Set checkbox <ChevronDown className="ml-1 h-3.5 w-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="w-[26rem] p-2">
									{bulkCheckboxFields.map((f) => (
										<div
											className="flex items-center justify-between gap-4 px-2 py-1.5"
											key={f.field}
										>
											<span className="flex-1 text-sm">{f.label}</span>
											<div className="flex shrink-0 gap-2">
												<Button
													onClick={() =>
														applyBulkAction({ field: f.field, value: true })
													}
													size="sm"
													variant="outline"
												>
													Check
												</Button>
												<Button
													onClick={() =>
														applyBulkAction({ field: f.field, value: false })
													}
													size="sm"
													variant="ghost"
												>
													Uncheck
												</Button>
											</div>
										</div>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
							<Button
								onClick={() => applyBulkAction("archive")}
								size="sm"
								variant="destructive"
							>
								Archive
							</Button>
							<Button
								onClick={() => setSelectedIds(new Set())}
								size="sm"
								variant="ghost"
							>
								Clear
							</Button>
						</>
					)}
				</div>
			)}

			<div className="w-full">
				<Table classNameWrapper="max-h-[calc(100vh-4.5rem)]">
					<TableHeader className="sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)]">
						<TableRow>
							<TableHead className={HEAD_CLASS}>Client</TableHead>
							{filterHead("type", "Type")}
							<TableHead className={HEAD_CLASS}>Eval date</TableHead>
							{filterHead("evaluator", "Evaluator")}
							{filterHead("writer", "Writer")}
							{filterHead("status", "Status")}
							<TableHead className={HEAD_CLASS}>Claimed on</TableHead>
							{filterHead("writerDone", "Writer done")}
							{billingFields.map((f) => filterHead(f.key, f.label))}
							<TableHead className={HEAD_CLASS}>Notes</TableHead>
							{isApprover && <TableHead className={HEAD_CLASS} />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredReports.map((r) => {
							const canEditWriting = r.isMine || isApprover;
							return (
								<TableRow
									className={cn(
										// Opacity on the row would dim its buttons too, so dim the cells
										// without buttons, plus the text beside buttons in mixed cells.
										!r.clientActive &&
											"[&_td:has(button)_span]:opacity-50 [&_td:not(:has(button))]:opacity-50",
										selectMode && "cursor-pointer select-none",
										isBethEvaluator(r.evalEvaluatorName) &&
											"font-bold **:font-bold",
									)}
									data-state={selectedIds.has(r.id) ? "selected" : undefined}
									key={r.id}
									onClick={(e) => onRowClick(e, r.id)}
								>
									<TableCell>
										<Link
											className="text-sm hover:underline"
											href={`/clients/${r.clientHash}`}
										>
											{r.clientFullName}
										</Link>
									</TableCell>
									<TableCell className="whitespace-nowrap">
										{r.asdAdhd && (
											<Badge variant="secondary">{r.asdAdhd}</Badge>
										)}
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
										{r.evalEvaluatorName ?? (
											<span className="text-muted-foreground text-xs">-</span>
										)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-sm">
										{writerDisplay(r.writerName, r.writerEmail) ?? (
											<span className="text-muted-foreground">Unclaimed</span>
										)}
									</TableCell>
									<TableCell>
										<StatusBadge
											selfWritten={r.selfWritten}
											status={r.status}
										/>
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
									<TableCell>
										<ReportNoteCell
											canEdit={canEditWriting}
											note={r.notes}
											reportId={r.id}
										/>
									</TableCell>
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
													{r.status === "approved" && (
														<Button
															onClick={() => unapprove.mutate({ id: r.id })}
															size="sm"
															variant="ghost"
														>
															Undo
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
		</div>
	);
}
