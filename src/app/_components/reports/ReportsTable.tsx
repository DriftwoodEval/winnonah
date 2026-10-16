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
import { useMediaQuery } from "~/hooks/use-media-query";
import { cn, formatCurrency } from "~/lib/utils";
import { api } from "~/trpc/react";
import { EmptyState } from "../shared/EmptyState";
import { ReportCard } from "./ReportCards";
import { ReportNoteCell } from "./ReportNoteCell";
import {
	ClientDriveLink,
	canApprove,
	formatReportDate,
	isBethEvaluator,
	type Report,
	ReportsLegend,
	StatusBadge,
	statusLabel,
	useReportMutations,
	writerDisplay,
} from "./report-shared";

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

export function ReportsTable({
	reports,
	tab,
	isApprover,
}: {
	reports: Report[];
	tab: "active" | "archived";
	isApprover: boolean;
}) {
	const { data: config } = api.reportQueue.getConfig.useQuery();
	const secondReview = config?.secondReviewLabel ?? "Second review";
	// Order matters here: it drives both the header row and each row's cells.
	// secondReview* sits right after "Writer done" and before "Billed".
	const secondReviewFields = [
		{ key: "secondReviewNeeded" as const, label: `${secondReview} needed` },
		{ key: "secondReviewDone" as const, label: `${secondReview} done` },
	];
	const billingFields = [
		...secondReviewFields,
		{ key: "billed" as const, label: "Billed" },
		{
			key: "firstReviewDone" as const,
			label: config?.firstReviewLabel ?? "First review",
		},
	];
	const otherBillingFields = billingFields.slice(secondReviewFields.length);
	// Matches Tailwind's `lg` breakpoint; the table's many columns need the width.
	const isMobile = useMediaQuery("(max-width: 1023px)");
	const { markComplete, setBilling, approve, unapprove, archive, unarchive } =
		useReportMutations();

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
					if (!canApprove(r)) return Promise.resolve();
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
		return <EmptyState title="No reports to show" />;
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

			<ReportsLegend />

			{isMobile ? (
				<div className="flex flex-col gap-2">
					{filteredReports.map((r) => (
						<ReportCard
							billingFields={billingFields}
							isApprover={isApprover}
							key={r.id}
							onToggleSelect={() => toggleOne(r.id)}
							report={r}
							selected={selectedIds.has(r.id)}
							selectMode={selectMode}
							tab={tab}
						/>
					))}
				</div>
			) : (
				<div className="w-full">
					<Table classNameWrapper="max-h-[calc(100vh-4.5rem)]">
						<TableHeader className="sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)]">
							<TableRow>
								<TableHead
									className={cn(
										HEAD_CLASS,
										"max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-background",
									)}
								>
									Client
								</TableHead>
								{filterHead("type", "Type")}
								<TableHead className={HEAD_CLASS}>Eval date</TableHead>
								{filterHead("evaluator", "Evaluator")}
								{filterHead("writer", "Writer")}
								<TableHead className={HEAD_CLASS}>Claimed on</TableHead>
								{filterHead("writerDone", "Writer done")}
								{filterHead("status", "Status")}
								<TableHead className={HEAD_CLASS}>
									<div className="flex items-end gap-1">
										{secondReview}
										{secondReviewFields.map((f) => (
											<ColumnFilter
												columnName={f.label}
												key={f.key}
												onFilterChange={(v) =>
													setFilters((cur) => ({ ...cur, [f.key]: v }))
												}
												options={filterOptions(f.key)}
												selectedValues={filters[f.key]}
											/>
										))}
									</div>
								</TableHead>
								{otherBillingFields.map((f) => filterHead(f.key, f.label))}
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
											r.clientOutstandingBalance > 0 &&
												"bg-destructive/15 hover:bg-destructive/20",
										)}
										data-state={selectedIds.has(r.id) ? "selected" : undefined}
										key={r.id}
										onClick={(e) => onRowClick(e, r.id)}
									>
										<TableCell
											className={cn(
												"max-w-[200px] max-md:sticky max-md:left-0 max-md:z-10",
												r.clientOutstandingBalance > 0
													? "max-md:bg-destructive/15"
													: "max-md:bg-background",
											)}
										>
											<div className="flex items-center gap-1.5">
												<Link
													className="block truncate text-sm hover:underline"
													href={`/clients/${r.clientHash}`}
													title={
														r.clientOutstandingBalance > 0
															? `${r.clientFullName} (${formatCurrency(r.clientOutstandingBalance)} outstanding)`
															: r.clientFullName
													}
												>
													{r.clientFullName}
												</Link>
												<ClientDriveLink report={r} />
											</div>
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
												formatReportDate(r.evalAppointmentAt)
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
										<TableCell className="whitespace-nowrap text-sm">
											{r.claimedAt ? formatReportDate(r.claimedAt) : "-"}
										</TableCell>
										<TableCell className="whitespace-nowrap">
											{r.writerCompletedAt ? (
												<div className="flex items-center gap-1">
													<span className="text-muted-foreground text-xs">
														{formatReportDate(r.writerCompletedAt)}
													</span>
													{canEditWriting && (
														<Button
															onClick={() =>
																markComplete.mutate({
																	id: r.id,
																	complete: false,
																})
															}
															size="xs"
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
													size="xs"
												>
													Mark done
												</Button>
											) : (
												<span className="text-muted-foreground text-xs">-</span>
											)}
										</TableCell>
										<TableCell className="whitespace-nowrap">
											<div className="flex items-center gap-1">
												<StatusBadge
													selfWritten={r.selfWritten}
													status={r.status}
												/>
												{isApprover && tab === "active" && (
													<>
														{canApprove(r) && (
															<Button
																onClick={() => approve.mutate({ id: r.id })}
																size="xs"
															>
																Approve
															</Button>
														)}
														{r.status === "approved" && (
															<Button
																onClick={() => unapprove.mutate({ id: r.id })}
																size="xs"
																variant="ghost"
															>
																Undo
															</Button>
														)}
													</>
												)}
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col gap-1">
												{secondReviewFields.map((f) => (
													<div className="flex items-center gap-2" key={f.key}>
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
															<span className="text-muted-foreground text-xs">
																-
															</span>
														)}
														<span className="text-muted-foreground text-xs">
															{f.key === "secondReviewNeeded"
																? "Needed"
																: "Done"}
														</span>
													</div>
												))}
											</div>
										</TableCell>
										{otherBillingFields.map((f) => (
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
													<span className="text-muted-foreground text-xs">
														-
													</span>
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
														size="xs"
														variant="ghost"
													>
														Restore
													</Button>
												) : (
													<div className="flex items-center gap-1">
														<Button
															onClick={() => archive.mutate({ id: r.id })}
															size="xs"
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
			)}
		</div>
	);
}
