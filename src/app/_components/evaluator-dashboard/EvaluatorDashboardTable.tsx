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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn, getLocalDayFromUTCDate } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import { AppointmentNoteCell } from "./AppointmentNoteCell";
import { DueDateCell } from "./DueDateCell";
import { LastTaskDateCell } from "./LastTaskDateCell";
import { ReportCompleteButton } from "./ReportCompleteButton";
import { ShowAnywayCheckbox } from "./ShowAnywayCheckbox";

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
	const linkRef = useRef<HTMLAnchorElement>(null);
	const [isTruncated, setIsTruncated] = useState(false);

	useEffect(() => {
		const el = linkRef.current;
		if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
	}, []);

	const link = (
		<Link
			className="block max-w-[160px] truncate text-sm hover:underline"
			href={`/clients/${hash}`}
			ref={linkRef}
		>
			{name}
		</Link>
	);

	if (!isTruncated) return link;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{link}</TooltipTrigger>
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
	const config = api.evaluatorDashboard.getConfig.useQuery(undefined, {
		enabled: isAdmin,
	});

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

	const now = new Date();
	const pastDue = appointments.filter(
		(a) =>
			!a.reportCompletedAt &&
			new Date(a.startTime) <= now &&
			(getLocalDayFromUTCDate(a.effectiveDueDate) ?? a.effectiveDueDate) <= now,
	).length;
	const current = appointments.filter(
		(a) =>
			!a.reportCompletedAt &&
			new Date(a.startTime) <= now &&
			(getLocalDayFromUTCDate(a.effectiveDueDate) ?? a.effectiveDueDate) > now,
	).length;
	const future = appointments.filter((a) => new Date(a.startTime) > now).length;

	const countParts = [
		pastDue > 0 ? `${pastDue} past due` : null,
		current > 0 ? `${current} current` : null,
		future > 0 ? `${future} future` : null,
	].filter(Boolean);

	const count = (
		<p className="mb-2 text-muted-foreground text-sm">
			{countParts.length > 0
				? countParts.join(" / ")
				: `${appointments.length} appointment${appointments.length !== 1 ? "s" : ""}`}
		</p>
	);

	return (
		<>
			{/* Mobile card layout */}
			<div className="sm:hidden">
				{count}
				<div className="flex flex-col gap-3">
					{appointments.map((appt) => {
						const isOverdue =
							(getLocalDayFromUTCDate(appt.effectiveDueDate) ??
								appt.effectiveDueDate) <= new Date();
						const isCompleted = !!appt.reportCompletedAt;
						const redCard = isAdmin && (isCompleted || isOverdue);

						return (
							<div
								className={cn(
									"rounded-lg border bg-card p-4 shadow-xs",
									redCard && "border-destructive/40 bg-destructive/10",
									isCompleted && "opacity-60",
								)}
								key={appt.id}
							>
								<div className="mb-3 flex items-start justify-between gap-2">
									<div>
										<Link
											className={cn(
												"font-medium text-sm hover:underline",
												isCompleted && "line-through",
											)}
											href={`/clients/${appt.clientHash}`}
										>
											{appt.clientFullName}
										</Link>
										<p
											className={cn(
												"text-muted-foreground text-xs",
												isCompleted && "line-through",
											)}
										>
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
													? (getLocalDayFromUTCDate(
															appt.lastTaskCompletedDate,
														) ?? null)
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
													? (getLocalDayFromUTCDate(appt.dueDateOverride) ??
														null)
													: null
											}
											effectiveDueDate={appt.effectiveDueDate}
											isAdmin={isAdmin}
										/>
										{isAdmin && isOverdue && (
											<div className="mt-1 flex items-center gap-1">
												<ShowAnywayCheckbox
													appointmentId={appt.id}
													showAnyway={appt.showAnyway}
												/>
												<span className="text-muted-foreground text-xs">
													Show anyway
												</span>
											</div>
										)}
									</div>
								</div>

								<div className="flex items-center justify-between gap-2">
									<ReportCompleteButton
										appointmentId={appt.id}
										completedAt={appt.reportCompletedAt}
										completedByName={appt.reportCompletedByName}
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
							<TableHead className="w-[240px]">Note</TableHead>
							<TableHead>Last Task</TableHead>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<TableHead>Due Date</TableHead>
									</TooltipTrigger>
									<TooltipContent>
										{config.data?.dueDateWeeks} weeks from appointment date or
										last task date if it exists, overrideable
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							<TableHead>Complete</TableHead>
							{isAdmin && <TableHead />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{appointments.map((appt) => {
							const isOverdue =
								(getLocalDayFromUTCDate(appt.effectiveDueDate) ??
									appt.effectiveDueDate) <= new Date();
							const isCompleted = !!appt.reportCompletedAt;
							const redRow = isAdmin && (isCompleted || isOverdue);

							return (
								<TableRow
									className={cn(
										redRow && "bg-destructive/10 hover:bg-destructive/15",
										isCompleted && "line-through opacity-60",
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
									<TableCell className="w-[240px]">
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
													? (getLocalDayFromUTCDate(
															appt.lastTaskCompletedDate,
														) ?? null)
													: null
											}
											isAdmin={isAdmin}
										/>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<DueDateCell
												appointmentId={appt.id}
												dueDateOverride={
													appt.dueDateOverride
														? (getLocalDayFromUTCDate(appt.dueDateOverride) ??
															null)
														: null
												}
												effectiveDueDate={appt.effectiveDueDate}
												isAdmin={isAdmin}
											/>
											{isAdmin && isOverdue && (
												<div className="flex items-center gap-1">
													<ShowAnywayCheckbox
														appointmentId={appt.id}
														showAnyway={appt.showAnyway}
													/>
													<span className="text-muted-foreground text-xs">
														Show anyway
													</span>
												</div>
											)}
										</div>
									</TableCell>
									<TableCell>
										<ReportCompleteButton
											appointmentId={appt.id}
											completedAt={appt.reportCompletedAt}
											completedByName={appt.reportCompletedByName}
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
