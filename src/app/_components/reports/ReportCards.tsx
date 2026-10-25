"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Redact } from "@components/redaction/Redact";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { getHexFromColor } from "~/lib/colors";
import { cn, formatCurrency } from "~/lib/utils";
import { ReportNoteCell } from "./ReportNoteCell";
import {
	ClientDriveLink,
	canApprove,
	formatReportDate,
	isBethEvaluator,
	type Report,
	StatusBadge,
	useReportMutations,
	WriterCell,
} from "./report-shared";

export type BillingField =
	| "secondReviewNeeded"
	| "secondReviewDone"
	| "billed"
	| "firstReviewDone";

// Same row styling as the Reports table: red for an outstanding balance, bold
// for Beth's evals.
function cardClass(r: Report) {
	return cn(
		"rounded-lg border bg-card p-3 text-sm shadow-xs",
		r.clientOutstandingBalance > 0 && "border-destructive/30 bg-destructive/15",
		isBethEvaluator(r.evalEvaluatorName) && "font-bold **:font-bold",
	);
}

function useIsApprover() {
	const can = useCheckPermission();
	return can("reports:approve") || can("reports:billing");
}

function ClientHeader({ r }: { r: Report }) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-2",
				!r.clientActive && "opacity-50",
			)}
		>
			<Link
				className="no-underline! hover:no-underline! flex min-w-0 flex-wrap items-center gap-2 font-medium hover:underline"
				href={`/clients/${r.clientHash}`}
			>
				<span
					className="h-3 w-3 shrink-0 rounded-full"
					style={{ backgroundColor: getHexFromColor(r.clientColor) }}
				/>
				<ClientHoverCard clientHash={r.clientHash}>
					<Redact>{r.clientFullName}</Redact>
				</ClientHoverCard>
			</Link>
			<ClientDriveLink report={r} />
			{r.clientAutismStop && (
				<Badge size="sm" variant="destructive">
					Autism Stop
				</Badge>
			)}
			{r.clientPause && (
				<Badge size="sm" variant="destructive">
					Paused
				</Badge>
			)}
			{r.clientOutstandingBalance > 0 && (
				<Badge size="sm" variant="destructive">
					{formatCurrency(r.clientOutstandingBalance)} due
				</Badge>
			)}
			{r.asdAdhd && (
				<Badge size="sm" variant="secondary">
					{r.asdAdhd}
				</Badge>
			)}
			{r.selfWritten && (
				<Badge size="sm" variant="outline">
					self
				</Badge>
			)}
			<StatusBadge selfWritten={r.selfWritten} status={r.status} />
		</div>
	);
}

function EvalLine({ r }: { r: Report }) {
	return (
		<div
			className={cn(
				"text-muted-foreground text-xs",
				!r.clientActive && "opacity-50",
			)}
		>
			Eval{" "}
			{r.evalAppointmentAt
				? formatReportDate(r.evalAppointmentAt)
				: "date unknown"}
			{" · "}
			{r.evalEvaluatorName ?? "no evaluator"}
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			{children}
		</div>
	);
}

// A checkbox that says what it sets. Users who cannot edit billing see a
// badge when it is checked and nothing otherwise.
function LabeledCheckbox({
	report: r,
	field,
	label,
}: {
	report: Report;
	field: BillingField;
	label: string;
}) {
	const id = useId();
	const { setBilling } = useReportMutations();
	if (!r.canEditBilling) {
		return r[field] ? <Badge variant="secondary">{label}</Badge> : null;
	}
	return (
		<div className="flex items-center gap-1.5 text-xs">
			<Checkbox
				checked={r[field]}
				id={id}
				onCheckedChange={(v) =>
					setBilling.mutate({ id: r.id, field, value: v === true })
				}
			/>
			<Label className="font-normal text-xs" htmlFor={id}>
				{label}
			</Label>
		</div>
	);
}

/**
 * A report in a dashboard section: who and when (client, evaluator, eval date),
 * plus the action that clears it from the section, Approve and Archive.
 * `children` render after the buttons.
 */
export function SectionReportCard({
	report: r,
	doneField,
	doneLabel,
	className,
	children,
}: {
	report: Report;
	doneField: "writerCompletedAt" | BillingField;
	doneLabel: string;
	className?: string;
	children?: ReactNode;
}) {
	const isApprover = useIsApprover();
	const { markComplete, approve, archive } = useReportMutations();

	return (
		<div className={cn(cardClass(r), className)}>
			<ClientHeader r={r} />
			<EvalLine r={r} />
			<div className="mt-2 flex flex-wrap items-center gap-2">
				{doneField === "writerCompletedAt" ? (
					(r.isMine || isApprover) && (
						<Button
							onClick={() => markComplete.mutate({ id: r.id, complete: true })}
							size="xs"
						>
							Mark writer done
						</Button>
					)
				) : (
					<LabeledCheckbox field={doneField} label={doneLabel} report={r} />
				)}
				{isApprover && canApprove(r) && (
					<Button onClick={() => approve.mutate({ id: r.id })} size="xs">
						Approve
					</Button>
				)}
				{isApprover && (
					<Button
						onClick={() => archive.mutate({ id: r.id })}
						size="xs"
						variant="destructive"
					>
						Archive
					</Button>
				)}
				{children}
			</div>
		</div>
	);
}

/**
 * A report on the Reports page at narrow widths, with everything the table
 * columns show. In select mode the whole card toggles selection.
 */
export function ReportCard({
	report: r,
	tab,
	isApprover,
	billingFields,
	selectMode,
	selected,
	onToggleSelect,
}: {
	report: Report;
	tab: "active" | "archived";
	isApprover: boolean;
	billingFields: { key: BillingField; label: string }[];
	selectMode: boolean;
	selected: boolean;
	onToggleSelect: () => void;
}) {
	const { markComplete, approve, unapprove, archive, unarchive } =
		useReportMutations();
	const canEditWriting = r.isMine || isApprover;
	const dim = !r.clientActive && "opacity-50";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: selection is also available through the Select all control
		<div
			className={cn(
				cardClass(r),
				"flex flex-col gap-2",
				selectMode && "cursor-pointer select-none",
				selected && "ring-2 ring-primary",
			)}
			onClick={(e) => {
				if (
					selectMode &&
					!(e.target as HTMLElement).closest("button, input, a")
				) {
					onToggleSelect();
				}
			}}
		>
			<ClientHeader r={r} />
			<div className={cn("grid grid-cols-2 gap-2", dim)}>
				<Field label="Eval date">
					{r.evalAppointmentAt ? formatReportDate(r.evalAppointmentAt) : "-"}
				</Field>
				<Field label="Evaluator">{r.evalEvaluatorName ?? "-"}</Field>
				<Field label="Writer">
					<WriterCell report={r} />
				</Field>
				<Field label="Claimed on">
					{r.claimedAt ? formatReportDate(r.claimedAt) : "-"}
				</Field>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{r.writerCompletedAt ? (
					<>
						<span className="text-xs">
							Writer done {formatReportDate(r.writerCompletedAt)}
						</span>
						{canEditWriting && (
							<Button
								onClick={() =>
									markComplete.mutate({ id: r.id, complete: false })
								}
								size="xs"
								variant="ghost"
							>
								Undo
							</Button>
						)}
					</>
				) : (
					canEditWriting && (
						<Button
							onClick={() => markComplete.mutate({ id: r.id, complete: true })}
							size="xs"
						>
							Mark writer done
						</Button>
					)
				)}
				{isApprover && tab === "active" && canApprove(r) && (
					<Button onClick={() => approve.mutate({ id: r.id })} size="xs">
						Approve
					</Button>
				)}
				{isApprover && tab === "active" && r.status === "approved" && (
					<Button
						onClick={() => unapprove.mutate({ id: r.id })}
						size="xs"
						variant="ghost"
					>
						Undo approval
					</Button>
				)}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				{billingFields.map((f) => (
					<LabeledCheckbox
						field={f.key}
						key={f.key}
						label={f.label}
						report={r}
					/>
				))}
			</div>
			<ReportNoteCell canEdit={canEditWriting} note={r.notes} reportId={r.id} />
			{isApprover && (
				<div className="flex justify-end">
					{tab === "archived" ? (
						<Button
							onClick={() => unarchive.mutate({ id: r.id })}
							size="xs"
							variant="ghost"
						>
							Restore
						</Button>
					) : (
						<Button
							onClick={() => archive.mutate({ id: r.id })}
							size="xs"
							variant="destructive"
						>
							Archive
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
