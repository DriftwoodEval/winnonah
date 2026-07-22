"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { DatePicker } from "@ui/date-picker";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { TooltipProvider } from "@ui/tooltip";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClientSearchAndAdd } from "~/app/_components/clients/ClientSearchAndAdd";
import {
	buildColorMap,
	type CalAppt,
	CalendarDayView,
} from "~/app/_components/day-ahead/CalendarGrid";
import { getLocalTimeFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";

const APPOINTMENT_TYPES = ["DA", "EVAL", "DAEVAL"] as const;
type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

const DEFAULT_DURATION_MINUTES = 60;
const SUGGESTION_WINDOW_DAYS = 21;
const SLOT_STEP_MINUTES = 15;

function pad(n: number) {
	return n.toString().padStart(2, "0");
}

// Formats a real Date into a naive "YYYY-MM-DDTHH:mm:ss" wall-clock string using
// local getters. Appointment times are stored as naive America/New_York wall-clock
// values throughout the app (see appointments.ts getDayAhead), so this assumes the
// browser's local timezone is America/New_York, matching that existing convention.
function toNaiveWallClockString(date: Date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
		date.getHours(),
	)}:${pad(date.getMinutes())}:00`;
}

// The calendar grid (CalendarGrid.tsx) renders startTime/endTime the same way
// real appointments are stored: naive America/New_York wall-clock values
// labeled "UTC" (it unpacks them via getLocalTimeFromUTCDate). selectedSlot's
// Date is a genuine real-time instant (from Google Calendar or the manual time
// picker), so it has to be re-labeled the same way before handing it to the
// calendar preview, or it renders shifted by the Eastern UTC offset.
function toFakeUtcDate(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
		),
	);
}

function dateToDayString(date: Date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Parses a "YYYY-MM-DD" string as a local date. Plain `new Date("YYYY-MM-DD")`
// parses as UTC midnight, which can land on the wrong day once shifted to local
// time - this avoids that off-by-one.
function dayStringToLocalDate(dayString: string): Date {
	const [year, month, day] = dayString.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function durationForType(
	durations: Record<string, number> | null | undefined,
	type: AppointmentType,
): number {
	if (!durations) return DEFAULT_DURATION_MINUTES;
	if (typeof durations[type] === "number") return durations[type];
	const diagnosisKey = Object.keys(durations).find((key) =>
		key.startsWith(`${type}/`),
	);
	if (diagnosisKey && typeof durations[diagnosisKey] === "number") {
		return durations[diagnosisKey];
	}
	return DEFAULT_DURATION_MINUTES;
}

function isTypeAllowed(
	allowedTypes: string[] | null | undefined,
	type: AppointmentType,
): boolean {
	if (!allowedTypes || allowedTypes.length === 0) return true;
	return allowedTypes.some((t) => t === type || t.startsWith(`${type}/`));
}

// classifyAvailabilityEvents maps the "Virtual" office's prettyName to the
// synthetic key "VIRTUAL" (see src/lib/google.ts), while everywhere else in the
// app (schedulingClients.office, appointments.locationKey) uses "Virtual". This
// bridges that mismatch when matching an event's officeKeys against the office
// key selected in this form.
function eventMatchesOffice(
	officeKeys: string[] | undefined,
	office: string,
): boolean {
	if (!officeKeys || officeKeys.length === 0) return false;
	const target = office === "Virtual" ? "VIRTUAL" : office;
	return officeKeys.includes(target);
}

export function SchedulingHelper() {
	const searchParams = useSearchParams();
	const router = useRouter();
	// Client IDs are privileged (sequential, identify a real person's record) -
	// use the opaque hash the rest of the app already uses for client-facing
	// URLs (e.g. /clients/[hash]) instead of exposing the raw id here.
	const clientHash = searchParams.get("clientHash");

	const { data: resolvedClient, isLoading: isResolvingClient } =
		api.clients.getOne.useQuery(
			{ column: "hash", value: clientHash ?? "" },
			{ enabled: !!clientHash },
		);

	if (!clientHash) {
		return (
			<div className="mx-auto flex max-w-lg flex-col gap-3 pt-10">
				<h2 className="font-semibold text-lg">Choose a client</h2>
				<ClientSearchAndAdd
					addButtonLabel="Select"
					onAdd={(client) =>
						router.push(`/scheduling/helper?clientHash=${client.hash}`)
					}
					placeholder="Search for a client to schedule..."
				/>
			</div>
		);
	}

	if (isResolvingClient) {
		return <Skeleton className="h-96 w-full rounded-md" />;
	}

	if (!resolvedClient) {
		return <p className="text-muted-foreground">Client not found.</p>;
	}

	return <SchedulingHelperForClient clientId={resolvedClient.id} />;
}

// The scheduling queue's `code` mirrors the CPT code TA schedules against:
// 96136 is in-person testing (EVAL), 90791 is the virtual diagnostic intake (DA).
// See scheduling.ts `add`/`update`, which use the same mapping to auto-pick an office.
function appointmentTypeForQueueCode(
	code: string | null,
): AppointmentType | null {
	if (code === "90791") return "DA";
	if (code === "96136") return "EVAL";
	return null;
}

function SchedulingHelperForClient({ clientId }: { clientId: number }) {
	const { data: client, isLoading: isLoadingClient } =
		api.clients.getOne.useQuery({ column: "id", value: clientId.toString() });
	const { data: queueInfo } =
		api.schedulingHelper.getSchedulingQueueInfo.useQuery({ clientId });
	const { data: offices } = api.offices.getAll.useQuery();
	const { data: eligibleEvaluators, isLoading: isLoadingEvaluators } =
		api.evaluators.getEligibleForClient.useQuery(clientId);

	const [selectedOffice, setSelectedOffice] = useState<string | null>(null);
	const [selectedNpi, setSelectedNpi] = useState<number | null>(null);
	const [appointmentType, setAppointmentType] =
		useState<AppointmentType>("EVAL");
	// No default date: picking a date is a deliberate step (via the date picker
	// or a suggested-date chip below), not a value the scheduler has to notice
	// and override before it's used for anything real.
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);
	const [selectedSlot, setSelectedSlot] = useState<{
		start: Date;
		durationMinutes: number;
	} | null>(null);
	const [showDebug, setShowDebug] = useState(false);

	// Pre-fill from whatever was already set on the /scheduling queue row, once,
	// after both the queue row and eligible evaluators have loaded.
	const [defaultsApplied, setDefaultsApplied] = useState(false);
	useEffect(() => {
		if (defaultsApplied || queueInfo === undefined || !eligibleEvaluators) {
			return;
		}

		const queuedType = appointmentTypeForQueueCode(queueInfo.code);
		if (queuedType) setAppointmentType(queuedType);

		if (
			queueInfo.evaluatorNpi &&
			eligibleEvaluators.some((e) => e.npi === queueInfo.evaluatorNpi)
		) {
			setSelectedNpi(queueInfo.evaluatorNpi);
		}

		setDefaultsApplied(true);
	}, [queueInfo, eligibleEvaluators, defaultsApplied]);

	const office =
		selectedOffice ??
		queueInfo?.office ??
		client?.closestOffices?.[0]?.key ??
		null;

	// Virtual appointments are always DA (see parse_location_and_type in the
	// Python import - a "[V]" tag can only ever mean DA), so force it here too.
	useEffect(() => {
		if (office === "Virtual" && appointmentType !== "DA") {
			setAppointmentType("DA");
			setSelectedSlot(null);
		}
	}, [office, appointmentType]);

	const eligibleNpis = useMemo(
		() => eligibleEvaluators?.map((e) => e.npi) ?? [],
		[eligibleEvaluators],
	);

	// Fetch a wide window (today through SUGGESTION_WINDOW_DAYS out) so we can
	// suggest upcoming dates that actually have availability, rather than making
	// the scheduler guess-and-check dates one at a time. Widened further if the
	// scheduler manually picks a date outside that window.
	const rangeStart = useMemo(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (!selectedDate) return today;
		const dayBeforeSelected = new Date(selectedDate);
		dayBeforeSelected.setDate(dayBeforeSelected.getDate() - 1);
		dayBeforeSelected.setHours(0, 0, 0, 0);
		return dayBeforeSelected < today ? dayBeforeSelected : today;
	}, [selectedDate]);

	const rangeEnd = useMemo(() => {
		const suggestionEnd = new Date(rangeStart);
		suggestionEnd.setDate(suggestionEnd.getDate() + SUGGESTION_WINDOW_DAYS);
		if (!selectedDate) return suggestionEnd;
		const dayAfterSelected = new Date(selectedDate);
		dayAfterSelected.setDate(dayAfterSelected.getDate() + 2);
		dayAfterSelected.setHours(0, 0, 0, 0);
		return dayAfterSelected > suggestionEnd ? dayAfterSelected : suggestionEnd;
	}, [rangeStart, selectedDate]);

	// Fetched for every eligible evaluator (not just the selected one) so the
	// "Eligible Evaluators" list below can be filtered by who actually has
	// availability tagged for the selected office, rather than by their static
	// office assignment (which may be stale or not reflect where they'll take
	// virtual appointments from).
	const { data: availabilityByNpi, isLoading: isLoadingAvailability } =
		api.schedulingHelper.getAvailability.useQuery(
			{
				evaluatorNpis: eligibleNpis,
				start: rangeStart,
				end: rangeEnd,
			},
			{ enabled: eligibleNpis.length > 0 },
		);

	const filteredEvaluators = useMemo(() => {
		if (!eligibleEvaluators) return [];
		if (!office) return eligibleEvaluators;
		if (!availabilityByNpi) return [];
		return eligibleEvaluators.filter((evaluator) =>
			(availabilityByNpi[evaluator.npi] ?? []).some(
				(event) =>
					!event.isUnavailability &&
					eventMatchesOffice(event.officeKeys, office),
			),
		);
	}, [eligibleEvaluators, office, availabilityByNpi]);

	const selectedEvaluator = useMemo(
		() => eligibleEvaluators?.find((e) => e.npi === selectedNpi) ?? null,
		[eligibleEvaluators, selectedNpi],
	);

	const durationMinutes = selectedEvaluator
		? durationForType(
				selectedEvaluator.appointmentDurations as Record<string, number>,
				appointmentType,
			)
		: DEFAULT_DURATION_MINUTES;

	const dateString = selectedDate ? dateToDayString(selectedDate) : null;
	const { data: dayAppointments, isLoading: isLoadingDayAppointments } =
		api.schedulingHelper.getEvaluatorDayAppointments.useQuery(
			{ evaluatorNpi: selectedNpi ?? 0, date: dateString ?? "" },
			{ enabled: selectedNpi !== null && dateString !== null },
		);

	// Virtual appointments don't tie up a physical office, so being scheduled
	// in-office elsewhere that day (or virtually) isn't a real conflict.
	const conflictingAppointment =
		office === "Virtual"
			? undefined
			: dayAppointments?.find(
					(appt) =>
						appt.locationKey &&
						appt.locationKey !== "Virtual" &&
						office &&
						appt.locationKey !== office,
				);

	// Everyone's appointments at the selected office that day (including other
	// placeholders), so the scheduler can see the room's full picture before
	// placing a hold.
	const { data: officeCalendarData, isLoading: isLoadingOfficeCalendar } =
		api.schedulingHelper.getOfficeCalendar.useQuery(
			{ date: dateString ?? "" },
			{ enabled: !!office && dateString !== null },
		);

	const previewAppointment: CalAppt | null = useMemo(() => {
		if (
			!selectedSlot ||
			!selectedNpi ||
			!office ||
			!selectedEvaluator ||
			!client
		) {
			return null;
		}
		const realEnd = new Date(
			selectedSlot.start.getTime() + selectedSlot.durationMinutes * 60000,
		);
		return {
			id: "preview",
			startTime: toFakeUtcDate(selectedSlot.start),
			endTime: toFakeUtcDate(realEnd),
			daEval: appointmentType,
			asdAdhd: null,
			confirmedAt: null,
			clientName: client.fullName,
			clientHash: client.hash,
			locationKey: office,
			officeName: offices?.find((o) => o.key === office)?.prettyName ?? office,
			evaluatorNpi: selectedNpi,
			evaluatorName: selectedEvaluator.providerName,
			isCurrentUser: true,
			isPreview: true,
		};
	}, [
		selectedSlot,
		selectedNpi,
		office,
		selectedEvaluator,
		client,
		offices,
		appointmentType,
	]);

	const officeDayAppointments: CalAppt[] = useMemo(() => {
		if (!office) return previewAppointment ? [previewAppointment] : [];
		const real = (officeCalendarData ?? [])
			.filter((appt) => (appt.locationKey ?? "Virtual") === office)
			.map((appt) => ({
				...appt,
				isCurrentUser: appt.evaluatorNpi === selectedNpi,
			}));
		return previewAppointment ? [...real, previewAppointment] : real;
	}, [officeCalendarData, office, selectedNpi, previewAppointment]);

	const officeDayColorMap = useMemo(
		() => buildColorMap(officeDayAppointments),
		[officeDayAppointments],
	);

	const availableEvents = useMemo(() => {
		if (!selectedNpi || !availabilityByNpi) return [];
		return (availabilityByNpi[selectedNpi] ?? []).filter(
			(event) => !event.isUnavailability,
		);
	}, [selectedNpi, availabilityByNpi]);

	const suggestedDates = useMemo(() => {
		const days = new Set<string>();
		for (const event of availableEvents) {
			days.add(dateToDayString(new Date(event.start)));
		}
		return [...days].sort().slice(0, 10);
	}, [availableEvents]);

	// Bookable start times for the selected day/office: stepped candidates
	// through each "available" window (excluding all-day markers, handled
	// separately via hasAllDayAvailability), with anything that would overlap an
	// existing appointment that day filtered out. Without this, a single big
	// "available 9-8" block would only ever offer 9am as an option even if the
	// evaluator already has appointments booked earlier in that window.
	const dayWindows = useMemo(() => {
		return availableEvents.filter(
			(event) =>
				!event.isAllDay &&
				dateToDayString(new Date(event.start)) === dateString &&
				(!office || eventMatchesOffice(event.officeKeys, office)),
		);
	}, [availableEvents, dateString, office]);

	// appt.startTime/endTime come straight from the DB, where appointment times
	// are stored as naive America/New_York wall-clock values labeled "UTC" (see
	// appointments.ts getDayAhead / getEvaluatorDayAppointments). Availability
	// windows, by contrast, come from real Google Calendar Date objects with
	// genuine UTC offsets. Comparing their raw epoch values directly compares two
	// different timezone spaces and silently misses real overlaps - convert the
	// DB times through the same "naive-UTC label -> real local time" step used
	// everywhere else in the app (getLocalTimeFromUTCDate) before comparing.
	const busyRanges = useMemo(
		() =>
			(dayAppointments ?? [])
				.map((appt) => {
					const start = getLocalTimeFromUTCDate(appt.startTime);
					const end = getLocalTimeFromUTCDate(appt.endTime);
					if (!start || !end) return null;
					return { start: start.getTime(), end: end.getTime() };
				})
				.filter((range): range is { start: number; end: number } => !!range),
		[dayAppointments],
	);

	const slots = useMemo(() => {
		const candidates: Date[] = [];
		for (const window of dayWindows) {
			const windowStart = new Date(window.start).getTime();
			const windowEnd = new Date(window.end).getTime();
			const durationMs = durationMinutes * 60000;
			for (
				let start = windowStart;
				start + durationMs <= windowEnd;
				start += SLOT_STEP_MINUTES * 60000
			) {
				const end = start + durationMs;
				const overlapsExisting = busyRanges.some(
					(busy) => start < busy.end && end > busy.start,
				);
				if (!overlapsExisting) candidates.push(new Date(start));
			}
		}
		candidates.sort((a, b) => a.getTime() - b.getTime());
		return candidates;
	}, [dayWindows, busyRanges, durationMinutes]);

	const hasAllDayAvailability = useMemo(
		() =>
			availableEvents.some(
				(event) =>
					event.isAllDay &&
					dateToDayString(new Date(event.start)) === dateString &&
					(!office || eventMatchesOffice(event.officeKeys, office)),
			),
		[availableEvents, dateString, office],
	);

	const [manualTime, setManualTime] = useState("09:00");

	const utils = api.useUtils();
	const createPlaceholder = api.schedulingHelper.createPlaceholder.useMutation({
		onSuccess: () => {
			toast.success("Placeholder appointment created");
			setSelectedSlot(null);
			void utils.appointments.getByClientId.invalidate({ clientId });
			void utils.schedulingHelper.getEvaluatorDayAppointments.invalidate();
			// Refetch the office-day calendar so the new placeholder shows up as a
			// real block right away instead of only the (now-cleared) preview.
			void utils.schedulingHelper.getOfficeCalendar.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to create placeholder appointment", {
				description: error.message,
			});
		},
	});

	if (isLoadingClient) {
		return <Skeleton className="h-96 w-full rounded-md" />;
	}

	if (!client) {
		return <p className="text-muted-foreground">Client not found.</p>;
	}

	const handleConfirm = () => {
		if (!selectedNpi || !selectedSlot || !office) return;
		const end = new Date(
			selectedSlot.start.getTime() + selectedSlot.durationMinutes * 60000,
		);
		createPlaceholder.mutate({
			clientId,
			evaluatorNpi: selectedNpi,
			startTime: toNaiveWallClockString(selectedSlot.start),
			endTime: toNaiveWallClockString(end),
			daEval: appointmentType,
			locationKey: office,
		});
	};

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4 pb-10">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="font-bold text-2xl">
						Schedule Appointment: {client.fullName}
					</h2>
					<p className="text-muted-foreground text-sm">
						{client.closestOffices?.length
							? `Closest office: ${client.closestOffices[0]?.prettyName}`
							: "No closest office on file"}
					</p>
				</div>
				<Button asChild variant="outline">
					<Link href="/scheduling">Back to Scheduling</Link>
				</Button>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
				<div className="flex flex-col gap-4">
					<Card className="flex flex-col gap-4 p-4">
						<div className="flex flex-wrap gap-4">
							<div className="flex flex-col gap-1">
								<Label htmlFor="office-select">Office</Label>
								<Select
									onValueChange={(value) => {
										setSelectedOffice(value);
										setSelectedSlot(null);
									}}
									value={office ?? undefined}
								>
									<SelectTrigger className="w-48" id="office-select">
										<SelectValue placeholder="Select office" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Virtual">Virtual</SelectItem>
										{offices?.map((o) => (
											<SelectItem key={o.key} value={o.key}>
												{o.prettyName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1">
								<Label htmlFor="type-select">Appointment Type</Label>
								<Select
									disabled={office === "Virtual"}
									onValueChange={(value) => {
										setAppointmentType(value as AppointmentType);
										setSelectedSlot(null);
									}}
									value={appointmentType}
								>
									<SelectTrigger className="w-32" id="type-select">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{APPOINTMENT_TYPES.map((type) => (
											<SelectItem key={type} value={type}>
												{type}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{office === "Virtual" && (
									<span className="text-muted-foreground text-xs">
										Virtual appointments are always DA
									</span>
								)}
							</div>

							<div className="flex flex-col gap-1">
								<Label>Duration (minutes)</Label>
								<Input
									className="w-24"
									disabled
									type="number"
									value={durationMinutes}
								/>
							</div>

							<DatePicker
								date={selectedDate ?? undefined}
								id="date-select"
								label="Date"
								setDate={(date) => {
									if (date) setSelectedDate(date);
									setSelectedSlot(null);
								}}
							/>
						</div>
					</Card>

					<Card className="flex flex-col gap-3 p-4">
						<h3 className="font-semibold">Eligible Evaluators</h3>
						{isLoadingEvaluators || (!!office && isLoadingAvailability) ? (
							<Skeleton className="h-24 w-full rounded-md" />
						) : filteredEvaluators.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No eligible evaluators found
								{office ? " with availability at this office" : ""}.
							</p>
						) : (
							<div className="flex flex-wrap gap-2">
								{filteredEvaluators.map((evaluator) => (
									<Button
										key={evaluator.npi}
										onClick={() => {
											setSelectedNpi(evaluator.npi);
											setSelectedSlot(null);
										}}
										size="sm"
										variant={
											selectedNpi === evaluator.npi ? "default" : "outline"
										}
									>
										{evaluator.providerName}
									</Button>
								))}
							</div>
						)}
					</Card>

					{selectedNpi && (
						<Card className="flex flex-col gap-3 p-4">
							<h3 className="font-semibold">
								{selectedEvaluator?.providerName ?? "Selected evaluator"}'s next
								available dates
							</h3>
							{isLoadingAvailability ? (
								<Skeleton className="h-8 w-full rounded-md" />
							) : suggestedDates.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No availability found in the next {SUGGESTION_WINDOW_DAYS}{" "}
									days.
								</p>
							) : (
								<div className="flex flex-wrap gap-2">
									{suggestedDates.map((day) => (
										<Button
											key={day}
											onClick={() => {
												setSelectedDate(dayStringToLocalDate(day));
												setSelectedSlot(null);
											}}
											size="sm"
											variant={day === dateString ? "default" : "outline"}
										>
											{dayStringToLocalDate(day).toLocaleDateString(undefined, {
												weekday: "short",
												month: "short",
												day: "numeric",
											})}
										</Button>
									))}
								</div>
							)}
						</Card>
					)}

					{selectedNpi && !selectedDate && (
						<Card className="flex flex-col gap-3 p-4">
							<p className="text-muted-foreground text-sm">
								Pick a date above (or a suggested date) to see{" "}
								{selectedEvaluator?.providerName ?? "this evaluator"}'s
								availability.
							</p>
						</Card>
					)}

					{selectedNpi && selectedDate && (
						<Card className="flex flex-col gap-3 p-4">
							<h3 className="font-semibold">
								Availability for{" "}
								{selectedEvaluator?.providerName ?? "selected evaluator"} on{" "}
								{selectedDate.toLocaleDateString()}
							</h3>

							{selectedEvaluator &&
								!isTypeAllowed(
									selectedEvaluator.allowedAppointmentTypes as string[],
									appointmentType,
								) && (
									<Alert variant="destructive">
										<AlertTriangle />
										<AlertTitle>Type not allowed</AlertTitle>
										<AlertDescription>
											{selectedEvaluator.providerName} does not perform{" "}
											{appointmentType} appointments.
										</AlertDescription>
									</Alert>
								)}

							{conflictingAppointment && (
								<Alert variant="destructive">
									<AlertTriangle />
									<AlertTitle>Location conflict</AlertTitle>
									<AlertDescription>
										{selectedEvaluator?.providerName} already has an appointment
										at{" "}
										{conflictingAppointment.officeName ??
											conflictingAppointment.locationKey}{" "}
										on {selectedDate.toLocaleDateString()}. Scheduling at a
										different office may not be possible.
									</AlertDescription>
								</Alert>
							)}

							{isLoadingAvailability ||
							isLoadingDayAppointments ||
							!dayAppointments ? (
								<Skeleton className="h-24 w-full rounded-md" />
							) : slots.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{slots.map((start) => {
										const isSelected =
											selectedSlot?.start.getTime() === start.getTime();
										return (
											<Button
												key={start.getTime()}
												onClick={() =>
													setSelectedSlot({ start, durationMinutes })
												}
												size="sm"
												variant={isSelected ? "default" : "outline"}
											>
												{start.toLocaleTimeString([], {
													hour: "numeric",
													minute: "2-digit",
												})}
											</Button>
										);
									})}
								</div>
							) : hasAllDayAvailability ? (
								<div className="flex items-center gap-2">
									<p className="text-muted-foreground text-sm">
										Marked available all day - pick a time:
									</p>
									<Input
										className="w-28"
										onChange={(e) => setManualTime(e.target.value)}
										type="time"
										value={manualTime}
									/>
									<Button
										onClick={() => {
											if (!selectedDate) return;
											const [hours, minutes] = manualTime
												.split(":")
												.map(Number);
											const start = new Date(selectedDate);
											start.setHours(hours ?? 9, minutes ?? 0, 0, 0);
											setSelectedSlot({ start, durationMinutes });
										}}
										size="sm"
									>
										Use this time
									</Button>
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									No available slots found for this day.
								</p>
							)}

							{selectedSlot && (
								<>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2 text-sm">
											<span>Confirm placeholder for</span>
											<Badge variant="secondary">
												{selectedSlot.start.toLocaleTimeString([], {
													hour: "numeric",
													minute: "2-digit",
												})}{" "}
												-{" "}
												{new Date(
													selectedSlot.start.getTime() +
														selectedSlot.durationMinutes * 60000,
												).toLocaleTimeString([], {
													hour: "numeric",
													minute: "2-digit",
												})}
											</Badge>
											<Badge variant="outline">{appointmentType}</Badge>
											<Badge variant="outline">{office}</Badge>
										</div>
										<Button
											disabled={createPlaceholder.isPending || !office}
											onClick={handleConfirm}
										>
											{createPlaceholder.isPending
												? "Creating..."
												: "Create Placeholder"}
										</Button>
									</div>
								</>
							)}

							<Separator />
							<Collapsible onOpenChange={setShowDebug} open={showDebug}>
								<CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground">
									{showDebug ? (
										<ChevronDown className="h-3 w-3" />
									) : (
										<ChevronRight className="h-3 w-3" />
									)}
									Debug: raw calendar data
								</CollapsibleTrigger>
								<CollapsibleContent className="mt-2">
									<p className="mb-2 text-muted-foreground text-xs">
										Queried {selectedEvaluator?.providerName ?? "evaluator"}'s
										calendar from {rangeStart.toLocaleString()} to{" "}
										{rangeEnd.toLocaleString()}. Matching against office key{" "}
										<span className="font-mono">{office ?? "none"}</span>
										{office === "Virtual" && (
											<>
												{" "}
												(mapped to <span className="font-mono">VIRTUAL</span>)
											</>
										)}
										.
									</p>
									{isLoadingAvailability ? (
										<Skeleton className="h-16 w-full rounded-md" />
									) : availableEvents.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											No calendar events returned in this range at all (not just
											none matching the office/date) - the calendar query itself
											may be failing.
										</p>
									) : (
										<div className="flex flex-col gap-1 overflow-x-auto rounded-md border p-2 font-mono text-[10px]">
											{availableEvents
												.slice()
												.sort(
													(a, b) =>
														new Date(a.start).getTime() -
														new Date(b.start).getTime(),
												)
												.map((event) => {
													const matches =
														!!office &&
														eventMatchesOffice(event.officeKeys, office);
													return (
														<div
															className={`whitespace-nowrap ${matches ? "text-success" : ""}`}
															key={`${event.id}-${event.start.toString()}`}
														>
															{new Date(event.start).toLocaleString()} -{" "}
															{new Date(event.end).toLocaleString()} | summary=
															{JSON.stringify(event.summary)} | allDay=
															{String(event.isAllDay)} | officeKeys=
															{JSON.stringify(event.officeKeys ?? [])} | matches
															selected office={String(matches)}
														</div>
													);
												})}
										</div>
									)}
									<p className="mt-3 mb-2 text-muted-foreground text-xs">
										Existing appointments on {dateString} for this evaluator
										(used to exclude slots above - "corrected" is the DB's naive
										wall-clock value re-anchored to a real local time, "raw" is
										what a plain new Date() of the DB value shows).
									</p>
									{!dayAppointments ? (
										<Skeleton className="h-8 w-full rounded-md" />
									) : dayAppointments.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											No existing appointments returned for this day.
										</p>
									) : (
										<div className="flex flex-col gap-1 overflow-x-auto rounded-md border p-2 font-mono text-[10px]">
											{dayAppointments.map((appt) => {
												const correctedStart = getLocalTimeFromUTCDate(
													appt.startTime,
												);
												const correctedEnd = getLocalTimeFromUTCDate(
													appt.endTime,
												);
												return (
													<div className="whitespace-nowrap" key={appt.id}>
														raw={new Date(appt.startTime).toLocaleString()}-
														{new Date(appt.endTime).toLocaleString()} |
														corrected=
														{correctedStart?.toLocaleString()}-
														{correctedEnd?.toLocaleString()} | office=
														{appt.locationKey ?? appt.officeName ?? "none"} |
														placeholder=
														{String(appt.placeholder)}
													</div>
												);
											})}
										</div>
									)}
								</CollapsibleContent>
							</Collapsible>
						</Card>
					)}
				</div>

				<div className="lg:sticky lg:top-4">
					<Card className="flex flex-col gap-3 p-4">
						<h3 className="font-semibold">
							{office ?? "Office"} schedule
							{selectedDate ? ` on ${selectedDate.toLocaleDateString()}` : ""}
						</h3>
						<p className="text-muted-foreground text-xs">
							Everyone with an appointment at this office that day
							{selectedEvaluator
								? ` - ${selectedEvaluator.providerName} is highlighted`
								: ""}
							.
						</p>
						{!office ? (
							<p className="text-muted-foreground text-sm">
								Select an office first.
							</p>
						) : !selectedDate ? (
							<p className="text-muted-foreground text-sm">
								Pick a date to see this office's schedule.
							</p>
						) : isLoadingOfficeCalendar ? (
							<Skeleton className="h-48 w-full rounded-md" />
						) : (
							<TooltipProvider>
								<CalendarDayView
									appointments={officeDayAppointments}
									colorMap={officeDayColorMap}
								/>
							</TooltipProvider>
						)}
					</Card>
				</div>
			</div>
		</div>
	);
}
