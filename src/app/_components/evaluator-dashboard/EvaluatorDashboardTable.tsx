"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { format } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { AppointmentNoteCell } from "./AppointmentNoteCell";
import { DueDateCell } from "./DueDateCell";
import { LastTaskDateCell } from "./LastTaskDateCell";
import { ReportCompleteButton } from "./ReportCompleteButton";

type Appointment =
	RouterOutputs["evaluatorDashboard"]["getAppointments"][number];

interface EvaluatorDashboardTableProps {
	appointments: Appointment[];
	isAdmin: boolean;
	tab: "active" | "archived";
}

function TypeBadge({
	daEval,
	asdAdhd,
}: {
	daEval: Appointment["daEval"];
	asdAdhd: Appointment["asdAdhd"];
}) {
	if (!daEval) return null;
	const label = asdAdhd ? `${daEval} / ${asdAdhd}` : daEval;
	return <Badge variant="secondary">{label}</Badge>;
}

function ClientNameCell({ name, hash }: { name: string; hash: string }) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						className="block max-w-[160px] truncate text-sm hover:underline"
						href={`/clients/${hash}`}
					>
						{name}
					</Link>
				</TooltipTrigger>
				<TooltipContent>{name}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function EvaluatorDashboardTable({
	appointments,
	isAdmin,
	tab,
}: EvaluatorDashboardTableProps) {
	const utils = api.useUtils();

	const archiveRow = api.evaluatorDashboard.archiveRow.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
			toast.success("Appointment archived.");
		},
		onError: (err) =>
			toast.error("Failed to archive", { description: err.message }),
	});

	const unarchiveRow = api.evaluatorDashboard.unarchiveRow.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
			toast.success("Appointment restored.");
		},
		onError: (err) =>
			toast.error("Failed to restore", { description: err.message }),
	});

	if (appointments.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				No appointments to show.
			</p>
		);
	}

	const count = (
		<p className="mb-2 text-muted-foreground text-sm">
			{appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
		</p>
	);

	return (
		<>
			{/* Mobile card layout */}
			<div className="sm:hidden">
				{count}
				<div className="flex flex-col gap-3">
					{appointments.map((appt) => {
						const isOverdue = appt.effectiveDueDate <= new Date();
						const isCompleted = !!appt.reportCompletedAt;
						const redCard = isAdmin && (isCompleted || isOverdue);

						return (
							<div
								className={cn(
									"rounded-lg border bg-card p-4 shadow-xs",
									redCard && "border-destructive/40 bg-destructive/10",
								)}
								key={appt.id}
							>
								<div className="mb-3 flex items-start justify-between gap-2">
									<div>
										<Link
											className="font-medium text-sm hover:underline"
											href={`/clients/${appt.clientHash}`}
										>
											{appt.clientFullName}
										</Link>
										<p className="text-muted-foreground text-xs">
											{format(new Date(appt.startTime), "MMM d, yyyy")}
										</p>
									</div>
									<TypeBadge asdAdhd={appt.asdAdhd} daEval={appt.daEval} />
								</div>

								<div className="mb-3">
									<AppointmentNoteCell
										appointmentId={appt.id}
										initialContent={
											typeof appt.noteContent === "string"
												? appt.noteContent
												: null
										}
										isAdmin={isAdmin}
									/>
								</div>

								<div className="mb-3 grid grid-cols-2 gap-3 text-sm">
									<div>
										<p className="mb-1 text-muted-foreground text-xs">
											Last Task
										</p>
										<LastTaskDateCell
											appointmentId={appt.id}
											date={
												appt.lastTaskCompletedDate
													? new Date(appt.lastTaskCompletedDate)
													: null
											}
											isAdmin={isAdmin}
										/>
									</div>
									<div>
										<p className="mb-1 text-muted-foreground text-xs">
											Due Date
										</p>
										<DueDateCell
											appointmentId={appt.id}
											dueDateOverride={
												appt.dueDateOverride
													? new Date(appt.dueDateOverride)
													: null
											}
											effectiveDueDate={appt.effectiveDueDate}
											isAdmin={isAdmin}
										/>
									</div>
								</div>

								<div className="flex items-center justify-between gap-2">
									<ReportCompleteButton
										appointmentId={appt.id}
										completedAt={appt.reportCompletedAt}
										completedByEmail={appt.reportCompletedByEmail}
										isAdmin={isAdmin}
									/>
									{isAdmin && (
										<Button
											disabled={
												tab === "archived"
													? unarchiveRow.isPending
													: archiveRow.isPending
											}
											onClick={() =>
												tab === "archived"
													? unarchiveRow.mutate({ appointmentId: appt.id })
													: archiveRow.mutate({ appointmentId: appt.id })
											}
											size="sm"
											variant="ghost"
										>
											{tab === "archived" ? "Restore" : "Archive"}
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* Desktop table layout */}
			<div className="hidden w-full overflow-x-auto sm:block">
				{count}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Appointment Date</TableHead>
							<TableHead>Client</TableHead>
							<TableHead>Type</TableHead>
							<TableHead className="min-w-[220px]">Note</TableHead>
							<TableHead>Last Task</TableHead>
							<TableHead>Due Date</TableHead>
							<TableHead>Complete</TableHead>
							{isAdmin && <TableHead />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{appointments.map((appt) => {
							const isOverdue = appt.effectiveDueDate <= new Date();
							const isCompleted = !!appt.reportCompletedAt;
							const redRow = isAdmin && (isCompleted || isOverdue);

							return (
								<TableRow
									className={cn(
										redRow && "bg-destructive/10 hover:bg-destructive/15",
									)}
									key={appt.id}
								>
									<TableCell className="whitespace-nowrap">
										{format(new Date(appt.startTime), "MMM d, yyyy")}
									</TableCell>
									<TableCell>
										<ClientNameCell
											hash={appt.clientHash}
											name={appt.clientFullName}
										/>
									</TableCell>
									<TableCell className="whitespace-nowrap">
										<TypeBadge asdAdhd={appt.asdAdhd} daEval={appt.daEval} />
									</TableCell>
									<TableCell className="min-w-[220px]">
										<AppointmentNoteCell
											appointmentId={appt.id}
											initialContent={
												typeof appt.noteContent === "string"
													? appt.noteContent
													: null
											}
											isAdmin={isAdmin}
										/>
									</TableCell>
									<TableCell>
										<LastTaskDateCell
											appointmentId={appt.id}
											date={
												appt.lastTaskCompletedDate
													? new Date(appt.lastTaskCompletedDate)
													: null
											}
											isAdmin={isAdmin}
										/>
									</TableCell>
									<TableCell>
										<DueDateCell
											appointmentId={appt.id}
											dueDateOverride={
												appt.dueDateOverride
													? new Date(appt.dueDateOverride)
													: null
											}
											effectiveDueDate={appt.effectiveDueDate}
											isAdmin={isAdmin}
										/>
									</TableCell>
									<TableCell>
										<ReportCompleteButton
											appointmentId={appt.id}
											completedAt={appt.reportCompletedAt}
											completedByEmail={appt.reportCompletedByEmail}
											isAdmin={isAdmin}
										/>
									</TableCell>
									{isAdmin && (
										<TableCell>
											{tab === "archived" ? (
												<Button
													disabled={unarchiveRow.isPending}
													onClick={() =>
														unarchiveRow.mutate({ appointmentId: appt.id })
													}
													size="sm"
													variant="ghost"
												>
													Restore
												</Button>
											) : (
												<Button
													disabled={archiveRow.isPending}
													onClick={() =>
														archiveRow.mutate({ appointmentId: appt.id })
													}
													size="sm"
													variant="ghost"
												>
													Archive
												</Button>
											)}
										</TableCell>
									)}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</>
	);
}
