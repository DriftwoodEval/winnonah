"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { fromZonedTime } from "date-fns-tz";
import {
	AlertTriangle,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Info,
	Sparkles,
	X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClientHeader } from "~/app/_components/client/ClientHeader";
import { ClientSearchAndAdd } from "~/app/_components/clients/ClientSearchAndAdd";
import {
	type AvailabilityWindow,
	buildColorMap,
	type CalAppt,
	CalendarDayView,
	DAY_END,
	DAY_START,
} from "~/app/_components/day-ahead/CalendarGrid";
import {
	type CalendarBooking,
	type CalendarNote,
	SchedulingCalendar,
} from "~/app/_components/scheduling/SchedulingCalendar";
import { useEvaluatorColors } from "~/hooks/use-evaluator-colors";
import type { SortedClient } from "~/lib/api-types";
import { BUSINESS_TIMEZONE } from "~/lib/constants";
import type { CalendarEvent } from "~/lib/integrations/google";
import {
	countOpenSlots,
	freeIntervals,
	slotStarts,
	type TimeRange,
} from "~/lib/scheduling-slots";
import { cn, formatInBusinessTime, IS_DEV } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

const APPOINTMENT_TYPES = ["DA", "EVAL", "DAEVAL"] as const;
type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

const DEFAULT_DURATION_MINUTES = 60;
// How far out to look for availability, both for the "no upcoming
// availability" gray-out threshold and the underlying calendar fetch window.
const AVAILABILITY_WINDOW_DAYS = 21;
const SLOT_STEP_MINUTES = 30;
const VISIBLE_DAYS = 7;
// Snap step when manually picking a time on a day with no marked availability.
const MANUAL_TIME_SNAP_MINUTES = 30;

const MINUTE_MS = 60000;

type Evaluator = NonNullable<RouterOutputs["evaluators"]["getAll"]>[number];

function pad(n: number) {
	return n.toString().padStart(2, "0");
}

// Formats a genuine UTC instant as a naive business-local "YYYY-MM-DDTHH:mm:ss"
// wall-clock string, for the placeholder-creation API, which localizes it back
// to true UTC before storing (see business_to_utc in python/api/app.py).
function toBusinessWallClockString(date: Date) {
	return formatInBusinessTime(date, "yyyy-MM-dd'T'HH:mm:ss");
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

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

const HIDDEN_NPIS_KEY = "scheduling-helper-hidden-npis";

// The Sunday on or before today: the grid always shows Sunday-to-Saturday weeks.
function startOfWeek(): Date {
	const today = startOfToday();
	return addDays(today, -today.getDay());
}

function startOfToday(): Date {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today;
}

type DurationSource =
	| { kind: "app-default" }
	| { kind: "evaluator-setting"; key: string };

// Looks up an evaluator's configured duration for an appointment type (exact
// type key, then the first diagnosis-scoped key like "EVAL/ASD/young"), and
// reports which setting (if any) supplied the value, for display in the UI.
function durationForTypeWithSource(
	durations: Record<string, number> | null | undefined,
	type: AppointmentType,
): { minutes: number; source: DurationSource } {
	if (!durations) {
		return {
			minutes: DEFAULT_DURATION_MINUTES,
			source: { kind: "app-default" },
		};
	}
	if (typeof durations[type] === "number") {
		return {
			minutes: durations[type],
			source: { kind: "evaluator-setting", key: type },
		};
	}
	const diagnosisKey = Object.keys(durations).find((key) =>
		key.startsWith(`${type}/`),
	);
	if (diagnosisKey && typeof durations[diagnosisKey] === "number") {
		return {
			minutes: durations[diagnosisKey],
			source: { kind: "evaluator-setting", key: diagnosisKey },
		};
	}
	return { minutes: DEFAULT_DURATION_MINUTES, source: { kind: "app-default" } };
}

function isTypeAllowed(
	allowedTypes: string[] | null | undefined,
	type: AppointmentType,
): boolean {
	if (!allowedTypes || allowedTypes.length === 0) return true;
	return allowedTypes.some((t) => t === type || t.startsWith(`${type}/`));
}

// classifyAvailabilityEvents maps the "Virtual" office's prettyName to the
// synthetic key "VIRTUAL" (see src/lib/integrations/google.ts), while everywhere else in the
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

function isVirtualOffice(key: string | null | undefined): boolean {
	return key?.toUpperCase() === "VIRTUAL";
}

function eventCoversDay(event: CalendarEvent, day: string): boolean {
	const dayStart = fromZonedTime(
		`${day}T00:00:00`,
		BUSINESS_TIMEZONE,
	).getTime();
	const dayEnd = dayStart + 24 * 60 * 60 * 1000;
	return event.start.getTime() < dayEnd && event.end.getTime() > dayStart;
}

// Marked availability for one evaluator-day as time ranges. All-day events
// have no real hours, so they count as the grid's whole visible day.
function availabilityRanges(
	dayEvents: CalendarEvent[],
	day: string,
	office: string | null,
): TimeRange[] {
	return dayEvents
		.filter(
			(e) =>
				!e.isUnavailability &&
				!e.isPlanned &&
				(!office || eventMatchesOffice(e.officeKeys, office)),
		)
		.map((e) =>
			e.isAllDay
				? {
						start: fromZonedTime(
							`${day}T${pad(DAY_START)}:00:00`,
							BUSINESS_TIMEZONE,
						).getTime(),
						end: fromZonedTime(
							`${day}T${pad(DAY_END)}:00:00`,
							BUSINESS_TIMEZONE,
						).getTime(),
					}
				: { start: e.start.getTime(), end: e.end.getTime() },
		);
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

// Lets another page (e.g. the day-ahead calendars) deep-link into a
// particular evaluator/day/time instead of landing on a blank grid.
export type SchedulingHelperPrefill = {
	npi: number | null;
	date: string | null;
	time: string | null;
	office: string | null;
	type: AppointmentType | null;
};

function readPrefill(searchParams: URLSearchParams): SchedulingHelperPrefill {
	const npiParam = searchParams.get("npi");
	const npi = npiParam ? Number(npiParam) : null;
	const date = searchParams.get("date");
	const typeParam = searchParams.get("type");
	return {
		npi: npi && Number.isFinite(npi) ? npi : null,
		date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
		time: searchParams.get("time"),
		office: searchParams.get("office"),
		type: APPOINTMENT_TYPES.includes(typeParam as AppointmentType)
			? (typeParam as AppointmentType)
			: null,
	};
}

export function SchedulingHelper() {
	const searchParams = useSearchParams();
	// Client IDs are privileged (sequential, identify a real person's record) -
	// use the opaque hash the rest of the app already uses for client-facing
	// URLs (e.g. /clients/[hash]) instead of exposing the raw id here.
	const clientHash = searchParams.get("clientHash");

	const { data: lockedClient, isLoading: isLoadingLockedClient } =
		api.clients.getOne.useQuery(
			{ column: "hash", value: clientHash ?? "" },
			{ enabled: !!clientHash },
		);

	if (clientHash && isLoadingLockedClient) {
		return <Skeleton className="h-96 w-full rounded-md" />;
	}

	if (clientHash && !lockedClient) {
		return <p className="text-muted-foreground">Client not found.</p>;
	}

	return (
		<SchedulingHelperGrid
			lockedClient={clientHash ? (lockedClient ?? null) : null}
			prefill={readPrefill(searchParams)}
		/>
	);
}

type ClientLike = { id: number; hash: string; fullName: string };

// Open-slot estimate per appointment type an evaluator can take that day.
type SlotsLeft = { type: AppointmentType; count: number }[];

type CellKind =
	| {
			kind: "booked";
			appointmentCount: number;
			officeLabel: string;
			locationKey: string | null;
			placeholder: boolean;
			id: string;
			startTime: Date;
			endTime: Date;
	  }
	| { kind: "planned"; officeLabel: string }
	| { kind: "available"; officeLabels: string[] }
	| { kind: "ooo" }
	| { kind: "empty" };

type CellStatus = CellKind & {
	slotsLeft: SlotsLeft;
	// Marked availability exists but no appointment type fits anymore.
	full: boolean;
};

// How many weeks forward (or back) of the current week a given date falls
// in, so a deep-linked date scrolls the grid to the right week.
function weekOffsetForDate(dateStr: string): number {
	const diffDays = Math.round(
		(dayStringToLocalDate(dateStr).getTime() - startOfWeek().getTime()) /
			86400000,
	);
	return Math.floor(diffDays / VISIBLE_DAYS);
}

function SchedulingHelperGrid({
	lockedClient,
	prefill,
}: {
	lockedClient: ClientLike | null;
	prefill?: SchedulingHelperPrefill;
}) {
	const { data: offices } = api.offices.getAll.useQuery({
		includeArchived: true,
	});
	const { data: evaluators, isLoading: isLoadingEvaluators } =
		api.evaluators.getAll.useQuery();
	const [pendingClient, setPendingClient] = useState<SortedClient | null>(null);
	const effectiveClient = lockedClient ?? pendingClient;
	const { data: queueInfo } =
		api.schedulingHelper.getSchedulingQueueInfo.useQuery(
			{ clientId: effectiveClient?.id ?? 0 },
			{ enabled: !!effectiveClient },
		);

	const [officeFilter, setOfficeFilter] = useState<string | null>(
		prefill?.office ?? null,
	);
	const [appointmentType, setAppointmentType] = useState<AppointmentType>(
		prefill?.type ?? "EVAL",
	);
	const [weekOffset, setWeekOffset] = useState(() =>
		prefill?.date ? weekOffsetForDate(prefill.date) : 0,
	);
	const [selectedCell, setSelectedCell] = useState<{
		npi: number;
		date: string;
	} | null>(() =>
		prefill?.npi && prefill.date
			? { npi: prefill.npi, date: prefill.date }
			: null,
	);
	const [selectedSlot, setSelectedSlot] = useState<{
		start: Date;
		durationMinutes: number;
	} | null>(null);
	const [showDebug, setShowDebug] = useState(false);
	const [view, setView] = useState<"calendar" | "evaluator" | "date">(
		"calendar",
	);

	// Evaluators hidden in the calendar view, remembered across visits.
	const [hiddenNpis, setHiddenNpis] = useState<Set<number>>(new Set());
	useEffect(() => {
		try {
			const saved = localStorage.getItem(HIDDEN_NPIS_KEY);
			if (saved) setHiddenNpis(new Set(JSON.parse(saved) as number[]));
		} catch {
			// Storage unavailable or corrupt: start with nobody hidden.
		}
	}, []);

	const saveHiddenNpis = useCallback((next: Set<number>) => {
		setHiddenNpis(next);
		try {
			localStorage.setItem(HIDDEN_NPIS_KEY, JSON.stringify([...next]));
		} catch {
			// Storage unavailable: the filter just won't persist.
		}
	}, []);

	function toggleEvaluator(npi: number) {
		const next = new Set(hiddenNpis);
		if (!next.delete(npi)) next.add(npi);
		saveHiddenNpis(next);
	}

	// Pre-fill office/type from whatever was already set on the /scheduling
	// queue row, once per client, after it loads. Picking a different client
	// also brings the assigned-evaluator filter back.
	const [defaultsAppliedFor, setDefaultsAppliedFor] = useState<number | null>(
		null,
	);
	const clientId = effectiveClient?.id ?? null;
	useEffect(() => {
		if (clientId === null || queueInfo === undefined || !evaluators) return;
		if (defaultsAppliedFor === clientId) return;
		const queuedType = appointmentTypeForQueueCode(queueInfo.code);
		if (queuedType) setAppointmentType(queuedType);
		if (queueInfo.office) setOfficeFilter(queueInfo.office);
		setShowAllEvaluators(false);
		// A client with a starred evaluator narrows the calendar to just them;
		// otherwise the saved filter stays as it was.
		const starredNpi = queueInfo.evaluatorNpi;
		if (starredNpi && evaluators.some((e) => e.npi === starredNpi)) {
			saveHiddenNpis(
				new Set(
					evaluators.filter((e) => e.npi !== starredNpi).map((e) => e.npi),
				),
			);
		}
		setDefaultsAppliedFor(clientId);
	}, [clientId, queueInfo, evaluators, defaultsAppliedFor, saveHiddenNpis]);

	const office = officeFilter;

	// Virtual appointments are always DA (see parse_location_and_type in the
	// Python import - a "[V]" tag can only ever mean DA), so force it here too.
	useEffect(() => {
		if (office === "Virtual" && appointmentType !== "DA") {
			setAppointmentType("DA");
		}
	}, [office, appointmentType]);

	// A client already assigned an evaluator on the /scheduling table only needs
	// that evaluator's rows, unless the user opts back into everyone.
	const assignedNpi = queueInfo?.evaluatorNpi ?? null;
	const [showAllEvaluators, setShowAllEvaluators] = useState(false);
	// The calendar always shows every evaluator side by side.
	const filterToAssigned =
		!!assignedNpi && !showAllEvaluators && view !== "calendar";

	const typeAllowedEvaluators = useMemo(
		() =>
			(evaluators ?? [])
				.filter(
					(e) =>
						(!filterToAssigned || e.npi === assignedNpi) &&
						isTypeAllowed(
							e.allowedAppointmentTypes as string[],
							appointmentType,
						),
				)
				.toSorted((a, b) => a.providerName.localeCompare(b.providerName)),
		[evaluators, appointmentType, assignedNpi, filterToAssigned],
	);

	const evaluatorNpis = useMemo(
		() => typeAllowedEvaluators.map((e) => e.npi),
		[typeAllowedEvaluators],
	);

	const rangeStart = useMemo(() => startOfWeek(), []);
	const visibleStart = useMemo(
		() => addDays(rangeStart, weekOffset * VISIBLE_DAYS),
		[rangeStart, weekOffset],
	);
	const visibleDays = useMemo(
		() =>
			Array.from({ length: VISIBLE_DAYS }, (_, i) =>
				dateToDayString(addDays(visibleStart, i)),
			),
		[visibleStart],
	);
	const rangeEnd = useMemo(() => {
		const minEnd = addDays(startOfToday(), AVAILABILITY_WINDOW_DAYS);
		const visibleEnd = addDays(visibleStart, VISIBLE_DAYS);
		return visibleEnd > minEnd ? visibleEnd : minEnd;
	}, [visibleStart]);

	const { data: availabilityByNpi, isLoading: isLoadingAvailability } =
		api.schedulingHelper.getAvailability.useQuery(
			{ evaluatorNpis, start: rangeStart, end: rangeEnd },
			{ enabled: evaluatorNpis.length > 0 },
		);

	const { data: appointmentsByNpi, isLoading: isLoadingAppointments } =
		api.schedulingHelper.getEvaluatorAppointmentsInRange.useQuery(
			{ evaluatorNpis, start: rangeStart, end: rangeEnd },
			{ enabled: evaluatorNpis.length > 0 },
		);

	const officeKeyToLabel = useMemo(() => {
		const map = new Map<string, string>();
		map.set("Virtual", "Virtual");
		map.set("VIRTUAL", "Virtual");
		for (const o of offices ?? []) map.set(o.key, o.prettyName);
		return map;
	}, [offices]);

	// An evaluator counts as "available" here if they have marked calendar
	// availability, or already have an appointment booked in the window (they
	// clearly work, even if they haven't marked availability) - this only
	// affects whether their name is grayed out, not the per-day cell colors.
	const hasAvailabilityInWindow = useMemo(() => {
		const result = new Map<number, boolean>();
		for (const npi of evaluatorNpis) {
			const events = availabilityByNpi?.[npi] ?? [];
			const hasMarkedAvailability = events.some(
				(e) =>
					!e.isUnavailability &&
					!e.isPlanned &&
					(!office || eventMatchesOffice(e.officeKeys, office)),
			);
			const hasBookedAppointment = (appointmentsByNpi?.[npi]?.length ?? 0) > 0;
			result.set(npi, hasMarkedAvailability || hasBookedAppointment);
		}
		return result;
	}, [evaluatorNpis, availabilityByNpi, appointmentsByNpi, office]);

	const evaluatorByNpi = useMemo(
		() => new Map((evaluators ?? []).map((e) => [e.npi, e])),
		[evaluators],
	);

	// Appointment types the evaluator can take at the current office filter
	// (virtual visits are always DA).
	function typesFor(evaluator: Evaluator | undefined): AppointmentType[] {
		if (!evaluator) return [];
		return APPOINTMENT_TYPES.filter(
			(type) =>
				(office !== "Virtual" || type === "DA") &&
				isTypeAllowed(evaluator.allowedAppointmentTypes as string[], type),
		);
	}

	function durationMsFor(evaluator: Evaluator, type: AppointmentType) {
		return (
			durationForTypeWithSource(
				evaluator.appointmentDurations as Record<string, number>,
				type,
			).minutes * MINUTE_MS
		);
	}

	// Marked availability minus existing appointments for one evaluator-day, or
	// null when nothing is marked (so open slots can't be estimated).
	function freeTimeFor(npi: number, day: string): TimeRange[] | null {
		const dayEvents = (availabilityByNpi?.[npi] ?? []).filter((e) =>
			eventCoversDay(e, day),
		);
		const windows = availabilityRanges(dayEvents, day, office);
		if (windows.length === 0) return null;
		const busy = (appointmentsByNpi?.[npi] ?? [])
			.filter((a) => a.date === day)
			.map((a) => ({ start: a.startTime.getTime(), end: a.endTime.getTime() }));
		return freeIntervals(windows, busy);
	}

	function cellStatus(npi: number, day: string): CellStatus {
		const evaluator = evaluatorByNpi.get(npi);
		const free = freeTimeFor(npi, day);
		const slotsLeft: SlotsLeft = free
			? typesFor(evaluator).map((type) => ({
					type,
					count: countOpenSlots(
						free,
						evaluator ? durationMsFor(evaluator, type) : 0,
					),
				}))
			: [];
		const full = !!free && slotsLeft.every((s) => s.count === 0);
		return { ...baseCellStatus(npi, day), slotsLeft, full };
	}

	function baseCellStatus(npi: number, day: string): CellKind {
		const dayBooked = (appointmentsByNpi?.[npi] ?? []).filter(
			(a) => a.date === day,
		);
		const booked = dayBooked[0];
		if (booked) {
			return {
				kind: "booked",
				appointmentCount: dayBooked.length,
				officeLabel:
					booked.officeName ??
					officeKeyToLabel.get(booked.locationKey ?? "") ??
					booked.locationKey ??
					"Virtual",
				locationKey: booked.locationKey,
				placeholder: booked.placeholder,
				id: booked.id,
				startTime: booked.startTime,
				endTime: booked.endTime,
			};
		}

		const events = availabilityByNpi?.[npi] ?? [];
		const dayEvents = events.filter((e) => eventCoversDay(e, day));

		const planned = dayEvents.find((e) => e.isPlanned);
		if (planned) {
			return {
				kind: "planned",
				officeLabel:
					officeKeyToLabel.get(planned.officeKeys?.[0] ?? "") ??
					planned.summary?.replace(/^Planned:\s*/i, "") ??
					"Office",
			};
		}

		if (dayEvents.some((e) => e.isUnavailability)) return { kind: "ooo" };

		const availableEvents = dayEvents.filter(
			(e) =>
				!e.isUnavailability &&
				!e.isPlanned &&
				(!office || eventMatchesOffice(e.officeKeys, office)),
		);
		if (availableEvents.length > 0) {
			const officeLabels = [
				...new Set(
					availableEvents.flatMap(
						(e) =>
							e.officeKeys?.map((key) => officeKeyToLabel.get(key) ?? key) ??
							[],
					),
				),
			];
			return { kind: "available", officeLabels };
		}

		return { kind: "empty" };
	}

	const selectedEvaluator = useMemo(
		() =>
			typeAllowedEvaluators.find((e) => e.npi === selectedCell?.npi) ?? null,
		[typeAllowedEvaluators, selectedCell],
	);

	// There's a single "Office" selector, shared between browsing the grid and
	// booking - clicking a cell points it at whatever's marked for that cell
	// (in priority order: a planned office, marked calendar availability), so
	// it doesn't drift from what you just clicked. Falls back to leaving the
	// current filter alone if the day has none of the above (e.g. planning a
	// day with no calendar data yet). Deliberately ignores an existing booking's
	// own location - you might be scheduling a different office/type entirely
	// for this evaluator that day, and shouldn't have your filter silently
	// switched to match an unrelated appointment (e.g. their existing Virtual
	// visit shouldn't flip your in-person office filter to Virtual).
	function resolveOfficeForCell(npi: number, day: string): string | null {
		const dayEvents = (availabilityByNpi?.[npi] ?? []).filter((e) =>
			eventCoversDay(e, day),
		);
		const planned = dayEvents.find((e) => e.isPlanned);
		const plannedKey = planned?.officeKeys?.[0];
		if (plannedKey) return plannedKey === "VIRTUAL" ? "Virtual" : plannedKey;

		const available = dayEvents.find(
			(e) =>
				!e.isUnavailability && !e.isPlanned && (e.officeKeys?.length ?? 0) > 0,
		);
		const availableKey = available?.officeKeys?.[0];
		if (availableKey)
			return availableKey === "VIRTUAL" ? "Virtual" : availableKey;

		return null;
	}

	const defaultDuration = useMemo(
		() =>
			durationForTypeWithSource(
				(selectedEvaluator?.appointmentDurations as Record<string, number>) ??
					null,
				appointmentType,
			),
		[selectedEvaluator, appointmentType],
	);

	const [durationOverride, setDurationOverride] = useState<number | null>(null);
	// The override only makes sense for the evaluator/type it was set for -
	// drop it when either changes so a stale custom duration doesn't silently
	// carry over to a different evaluator or appointment type. Reset during
	// render (rather than an effect) so it clears before the stale value can
	// ever be used to compute a slot.
	const durationResetKey = `${selectedCell?.npi ?? "none"}:${appointmentType}`;
	const durationResetKeyRef = useRef(durationResetKey);
	if (durationResetKeyRef.current !== durationResetKey) {
		durationResetKeyRef.current = durationResetKey;
		if (durationOverride !== null) setDurationOverride(null);
	}

	const durationMinutes = durationOverride ?? defaultDuration.minutes;

	const { data: dayAppointments, isLoading: isLoadingDayAppointments } =
		api.schedulingHelper.getEvaluatorDayAppointments.useQuery(
			{ evaluatorNpi: selectedCell?.npi ?? 0, date: selectedCell?.date ?? "" },
			{ enabled: !!selectedCell },
		);

	const { data: officeCalendarData, isLoading: isLoadingOfficeCalendar } =
		api.schedulingHelper.getOfficeCalendar.useQuery(
			{ date: selectedCell?.date ?? "" },
			{ enabled: !!selectedCell },
		);

	const { data: eligibleEvaluators } =
		api.evaluators.getEligibleForClient.useQuery(effectiveClient?.id ?? 0, {
			enabled: !!effectiveClient,
		});
	const evaluatorEligibleForClient =
		!effectiveClient ||
		!eligibleEvaluators ||
		!selectedCell ||
		eligibleEvaluators.some((e) => e.npi === selectedCell.npi);

	const [showIneligible, setShowIneligible] = useState(false);

	// Only split once a client is picked and eligibility has actually loaded -
	// otherwise (no client, or still loading) everyone stays in the eligible
	// list so the grid doesn't flash people into "ineligible" prematurely.
	// Within each list, evaluators with no marked availability (and no existing
	// booking) in the window sink to the bottom - still shown and pickable,
	// just out of the way of who's actually bookable right now.
	const { eligibleList, ineligibleList } = useMemo(() => {
		const byAvailability = (a: Evaluator, b: Evaluator) => {
			const aAvailable = hasAvailabilityInWindow.get(a.npi) ?? true;
			const bAvailable = hasAvailabilityInWindow.get(b.npi) ?? true;
			if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
			return 0;
		};

		if (!effectiveClient || !eligibleEvaluators) {
			return {
				eligibleList: typeAllowedEvaluators.toSorted(byAvailability),
				ineligibleList: [],
			};
		}
		const eligibleNpis = new Set(eligibleEvaluators.map((e) => e.npi));
		const eligible: Evaluator[] = [];
		const ineligible: Evaluator[] = [];
		for (const evaluator of typeAllowedEvaluators) {
			(eligibleNpis.has(evaluator.npi) ? eligible : ineligible).push(evaluator);
		}
		return {
			eligibleList: eligible.toSorted(byAvailability),
			ineligibleList: ineligible.toSorted(byAvailability),
		};
	}, [
		typeAllowedEvaluators,
		effectiveClient,
		eligibleEvaluators,
		hasAvailabilityInWindow,
	]);

	function openStartsFor(evaluator: Evaluator, day: string): number[] {
		const free = freeTimeFor(evaluator.npi, day);
		if (!free) return [];
		return slotStarts(
			free,
			durationMsFor(evaluator, appointmentType),
			SLOT_STEP_MINUTES * MINUTE_MS,
			Date.now(),
		);
	}

	// Earliest open slot in the fetched window, preferring the client's assigned
	// evaluator and falling back to the eligible evaluators.
	const nextAvailable = (() => {
		if (isLoadingAvailability || isLoadingAppointments) return null;
		const dayCount = Math.round(
			(rangeEnd.getTime() - rangeStart.getTime()) / 86400000,
		);
		function earliest(candidates: Evaluator[]) {
			for (let i = 0; i < dayCount; i++) {
				const day = dateToDayString(addDays(rangeStart, i));
				let best: { evaluator: Evaluator; day: string; start: number } | null =
					null;
				for (const evaluator of candidates) {
					const start = openStartsFor(evaluator, day)[0];
					if (start !== undefined && (!best || start < best.start)) {
						best = { evaluator, day, start };
					}
				}
				if (best) return best;
			}
			return null;
		}
		// The calendar's hidden evaluators are excluded from the search.
		const candidates =
			view === "calendar"
				? eligibleList.filter((e) => !hiddenNpis.has(e.npi))
				: eligibleList;
		const assigned = candidates.filter((e) => e.npi === assignedNpi);
		return earliest(assigned) ?? earliest(candidates);
	})();

	function pickSlot(evaluator: Evaluator, day: string, start: number) {
		const startDate = new Date(start);
		setSelectedCell({ npi: evaluator.npi, date: day });
		const resolved = resolveOfficeForCell(evaluator.npi, day);
		if (resolved) setOfficeFilter(resolved);
		setWeekOffset(weekOffsetForDate(day));
		setManualTime(formatInBusinessTime(startDate, "HH:mm"));
		setSelectedSlot({
			start: startDate,
			durationMinutes: durationMsFor(evaluator, appointmentType) / MINUTE_MS,
		});
	}

	const previewAppointment: CalAppt | null = useMemo(() => {
		if (!selectedSlot || !selectedCell || !office || !selectedEvaluator) {
			return null;
		}
		const realEnd = new Date(
			selectedSlot.start.getTime() + selectedSlot.durationMinutes * 60000,
		);
		return {
			id: "preview",
			startTime: selectedSlot.start,
			endTime: realEnd,
			daEval: appointmentType,
			asdAdhd: null,
			confirmedAt: null,
			clientName: effectiveClient?.fullName ?? "New appointment",
			clientHash: effectiveClient?.hash ?? "",
			clientPhone: null,
			locationKey: office,
			officeName: officeKeyToLabel.get(office) ?? office,
			evaluatorNpi: selectedCell.npi,
			evaluatorName: selectedEvaluator.providerName,
			isCurrentUser: true,
			isPreview: true,
			arrivedAt: null,
			arrivedBy: null,
			startedAt: null,
			startedBy: null,
			leftAt: null,
			leftBy: null,
		};
	}, [
		selectedSlot,
		selectedCell,
		office,
		selectedEvaluator,
		effectiveClient,
		appointmentType,
		officeKeyToLabel,
	]);

	// The selected evaluator's whole day, across every office (and virtual) -
	// not just whichever office is currently chosen for the new booking.
	const evaluatorDayAppointments: CalAppt[] = useMemo(() => {
		if (!selectedCell) return previewAppointment ? [previewAppointment] : [];
		const real = (officeCalendarData ?? [])
			.filter((appt) => appt.evaluatorNpi === selectedCell.npi)
			.map((appt) => ({ ...appt, isCurrentUser: true }));
		return previewAppointment ? [...real, previewAppointment] : real;
	}, [officeCalendarData, selectedCell, previewAppointment]);

	const chosenColors = useEvaluatorColors();
	const evaluatorDayColorMap = useMemo(
		() => buildColorMap(evaluatorDayAppointments, chosenColors),
		[evaluatorDayAppointments, chosenColors],
	);

	// Low-opacity layer behind the appointment blocks, showing the selected
	// evaluator's full marked availability that day across every office.
	const evaluatorDayAvailability: AvailabilityWindow[] = useMemo(() => {
		if (!selectedCell || !availabilityByNpi) return [];
		const events = availabilityByNpi[selectedCell.npi] ?? [];
		return events
			.filter(
				(event) =>
					!event.isUnavailability &&
					!event.isPlanned &&
					eventCoversDay(event, selectedCell.date),
			)
			.map((event) => {
				// All-day availability events carry midnight-anchored real
				// timestamps that don't map onto the grid's visible hour range -
				// draw those as spanning the whole visible day instead of using
				// their raw start/end.
				if (event.isAllDay) {
					return {
						evaluatorNpi: selectedCell.npi,
						start: fromZonedTime(
							`${selectedCell.date}T${pad(DAY_START)}:00:00`,
							BUSINESS_TIMEZONE,
						),
						end: fromZonedTime(
							`${selectedCell.date}T${pad(DAY_END)}:00:00`,
							BUSINESS_TIMEZONE,
						),
					};
				}
				return {
					evaluatorNpi: selectedCell.npi,
					start: event.start,
					end: event.end,
				};
			});
	}, [selectedCell, availabilityByNpi]);

	const busyRanges = useMemo(
		() =>
			(dayAppointments ?? []).map((appt) => ({
				start: new Date(appt.startTime).getTime(),
				end: new Date(appt.endTime).getTime(),
			})),
		[dayAppointments],
	);

	const dayWindows = useMemo(() => {
		if (!selectedCell || !office) return [];
		return (availabilityByNpi?.[selectedCell.npi] ?? []).filter(
			(event) =>
				!event.isUnavailability &&
				!event.isPlanned &&
				!event.isAllDay &&
				eventCoversDay(event, selectedCell.date) &&
				eventMatchesOffice(event.officeKeys, office),
		);
	}, [selectedCell, office, availabilityByNpi]);

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

	const hasAllDayAvailability = useMemo(() => {
		if (!selectedCell || !office) return false;
		return (availabilityByNpi?.[selectedCell.npi] ?? []).some(
			(event) =>
				event.isAllDay &&
				!event.isUnavailability &&
				!event.isPlanned &&
				eventCoversDay(event, selectedCell.date) &&
				eventMatchesOffice(event.officeKeys, office),
		);
	}, [selectedCell, office, availabilityByNpi]);

	const alreadyBooked = useMemo(() => {
		if (!selectedCell) return null;
		return (
			appointmentsByNpi?.[selectedCell.npi]?.find(
				(a) => a.date === selectedCell.date,
			) ?? null
		);
	}, [selectedCell, appointmentsByNpi]);

	// A booking that day at a different in-person office. Virtual visits never
	// conflict with an office, in either direction.
	const officeConflict = useMemo(() => {
		if (!selectedCell || !office || isVirtualOffice(office)) return null;
		return (
			appointmentsByNpi?.[selectedCell.npi]?.find(
				(a) =>
					a.date === selectedCell.date &&
					!isVirtualOffice(a.locationKey) &&
					a.locationKey !== office,
			) ?? null
		);
	}, [selectedCell, office, appointmentsByNpi]);

	const plannedEvent = useMemo(() => {
		if (!selectedCell) return null;
		return (
			(availabilityByNpi?.[selectedCell.npi] ?? []).find(
				(e) => e.isPlanned && eventCoversDay(e, selectedCell.date),
			) ?? null
		);
	}, [selectedCell, availabilityByNpi]);

	const [manualTime, setManualTime] = useState(prefill?.time ?? "09:00");

	const manualSlot = useMemo(() => {
		if (!selectedCell || !/^\d{2}:\d{2}$/.test(manualTime)) return null;
		const start = fromZonedTime(
			`${selectedCell.date}T${manualTime}:00`,
			BUSINESS_TIMEZONE,
		);
		const end = new Date(start.getTime() + durationMinutes * 60000);
		return { start, end };
	}, [selectedCell, manualTime, durationMinutes]);

	// Manually-picked times (no marked availability to constrain them) just
	// can't overlap an existing appointment.
	function manualSlotErrorFor(start: Date, end: Date): string | null {
		const overlapsExisting = busyRanges.some(
			(busy) => start.getTime() < busy.end && end.getTime() > busy.start,
		);
		if (overlapsExisting) return "Overlaps an existing appointment";
		return null;
	}

	const manualSlotError = manualSlot
		? manualSlotErrorFor(manualSlot.start, manualSlot.end)
		: null;

	// Snaps a click/drop position to the nearest half hour and resolves it to a
	// true UTC instant on the given business-local calendar day.
	function snappedTimeFromMinutes(
		dateStr: string,
		minutesFromMidnight: number,
	) {
		const snapped =
			Math.round(minutesFromMidnight / MANUAL_TIME_SNAP_MINUTES) *
			MANUAL_TIME_SNAP_MINUTES;
		const totalMinutes = ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
		const hh = pad(Math.floor(totalMinutes / 60));
		const mm = pad(totalMinutes % 60);
		return {
			start: fromZonedTime(`${dateStr}T${hh}:${mm}:00`, BUSINESS_TIMEZONE),
			hh,
			mm,
		};
	}

	// Clicking directly on the evaluator's calendar preview picks that time,
	// snapped to the nearest half hour, as long as it doesn't overlap an
	// existing appointment - same rule as the manual time input.
	function handleCalendarSlotClick(minutesFromMidnight: number) {
		if (!selectedCell) return;
		const { start, hh, mm } = snappedTimeFromMinutes(
			selectedCell.date,
			minutesFromMidnight,
		);
		const end = new Date(start.getTime() + durationMinutes * 60000);
		const error = manualSlotErrorFor(start, end);
		if (error) {
			toast.error(error);
			return;
		}
		setManualTime(`${hh}:${mm}`);
		setSelectedSlot({ start, durationMinutes });
	}

	const utils = api.useUtils();

	const createPlaceholder = api.schedulingHelper.createPlaceholder.useMutation({
		onSuccess: () => {
			toast.success("Placeholder appointment created");
			setSelectedSlot(null);
			void utils.appointments.getByClientId.invalidate();
			void utils.schedulingHelper.getEvaluatorDayAppointments.invalidate();
			void utils.schedulingHelper.getEvaluatorAppointmentsInRange.invalidate();
			void utils.schedulingHelper.getOfficeCalendar.invalidate();
			void utils.schedulingHelper.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to create placeholder appointment", {
				description: error.message,
			});
		},
	});

	const [pendingMove, setPendingMove] = useState<{
		appointmentId: string;
		clientName: string | null;
		evaluatorName: string;
		evaluatorNpi: number;
		locationKey: string;
		oldStart: Date;
		newStart: Date;
		newEnd: Date;
	} | null>(null);

	const movePlaceholder = api.schedulingHelper.movePlaceholder.useMutation({
		onSuccess: () => {
			toast.success("Placeholder moved");
			setPendingMove(null);
			void utils.schedulingHelper.getEvaluatorDayAppointments.invalidate();
			void utils.schedulingHelper.getEvaluatorAppointmentsInRange.invalidate();
			void utils.schedulingHelper.getOfficeCalendar.invalidate();
			void utils.schedulingHelper.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to move placeholder appointment", {
				description: error.message,
			});
		},
	});

	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

	const deletePlaceholder = api.schedulingHelper.deletePlaceholder.useMutation({
		onSuccess: () => {
			toast.success("Placeholder deleted");
			setPendingDeleteId(null);
			void utils.appointments.getByClientId.invalidate();
			void utils.schedulingHelper.getEvaluatorDayAppointments.invalidate();
			void utils.schedulingHelper.getEvaluatorAppointmentsInRange.invalidate();
			void utils.schedulingHelper.getOfficeCalendar.invalidate();
			void utils.schedulingHelper.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to delete placeholder appointment", {
				description: error.message,
			});
		},
	});

	// Dragging a placeholder block to a new time on its evaluator's day - see
	// CalendarDayView's onMovePlaceholder. Only opens the confirmation, the
	// actual move only happens once the user confirms it.
	function handleMovePlaceholderDrop(
		appointmentId: string,
		evaluatorNpi: number,
		minutesFromMidnight: number,
	) {
		if (!selectedCell) return;
		const moved = evaluatorDayAppointments.find((a) => a.id === appointmentId);
		if (!moved) return;
		const durationMs = moved.endTime.getTime() - moved.startTime.getTime();
		const { start: newStart } = snappedTimeFromMinutes(
			selectedCell.date,
			minutesFromMidnight,
		);
		const newEnd = new Date(newStart.getTime() + durationMs);
		const overlapsExisting = (dayAppointments ?? []).some(
			(appt) =>
				appt.id !== appointmentId &&
				newStart.getTime() < new Date(appt.endTime).getTime() &&
				newEnd.getTime() > new Date(appt.startTime).getTime(),
		);
		if (overlapsExisting) {
			toast.error("Overlaps an existing appointment");
			return;
		}
		setPendingMove({
			appointmentId,
			clientName: moved.clientName,
			evaluatorName: selectedEvaluator?.providerName ?? "this evaluator",
			evaluatorNpi,
			locationKey: moved.locationKey ?? office ?? "",
			oldStart: moved.startTime,
			newStart,
			newEnd,
		});
	}

	// Dragging a placeholder badge from one day column to another in the main
	// evaluator x day grid (same evaluator, no exact-time data there, so the
	// original time of day carries over) - see EvaluatorRow's onDropPlaceholder.
	function handleDropPlaceholderDay(args: {
		appointmentId: string;
		evaluatorNpi: number;
		day: string;
		startTime: Date;
		endTime: Date;
	}) {
		if (args.day === dateToDayString(args.startTime)) return;
		const durationMs = args.endTime.getTime() - args.startTime.getTime();
		const timeOfDay = formatInBusinessTime(args.startTime, "HH:mm:ss");
		const newStart = fromZonedTime(
			`${args.day}T${timeOfDay}`,
			BUSINESS_TIMEZONE,
		);
		const newEnd = new Date(newStart.getTime() + durationMs);

		const evaluatorAppointments = appointmentsByNpi?.[args.evaluatorNpi] ?? [];
		const record = evaluatorAppointments.find(
			(a) => a.id === args.appointmentId,
		);
		if (!record) return;

		const alreadyBookedThatDay = evaluatorAppointments.some(
			(a) => a.date === args.day && a.id !== args.appointmentId,
		);
		if (alreadyBookedThatDay) {
			toast.error("This evaluator already has an appointment that day");
			return;
		}

		setPendingMove({
			appointmentId: args.appointmentId,
			clientName: null,
			evaluatorName:
				typeAllowedEvaluators.find((e) => e.npi === args.evaluatorNpi)
					?.providerName ?? "this evaluator",
			evaluatorNpi: args.evaluatorNpi,
			locationKey: record.locationKey ?? "",
			oldStart: args.startTime,
			newStart,
			newEnd,
		});
	}

	function defaultDurationMinutesFor(npi: number) {
		const evaluator = evaluatorByNpi.get(npi);
		return evaluator
			? durationMsFor(evaluator, appointmentType) / MINUTE_MS
			: DEFAULT_DURATION_MINUTES;
	}

	function calendarWindowsFor(npi: number, day: string): TimeRange[] {
		const dayEvents = (availabilityByNpi?.[npi] ?? []).filter((e) =>
			eventCoversDay(e, day),
		);
		return availabilityRanges(dayEvents, day, office);
	}

	function calendarNoteFor(npi: number, day: string): CalendarNote | null {
		const dayEvents = (availabilityByNpi?.[npi] ?? []).filter((e) =>
			eventCoversDay(e, day),
		);
		if (dayEvents.some((e) => e.isUnavailability)) return { kind: "ooo" };
		const planned = dayEvents.find((e) => e.isPlanned);
		if (!planned) return null;
		return {
			kind: "planned",
			label:
				officeKeyToLabel.get(planned.officeKeys?.[0] ?? "") ??
				planned.summary?.replace(/^Planned:\s*/i, "") ??
				"Office",
		};
	}

	const calendarPreview =
		selectedSlot && selectedCell
			? {
					npi: selectedCell.npi,
					start: selectedSlot.start,
					end: new Date(
						selectedSlot.start.getTime() + selectedSlot.durationMinutes * 60000,
					),
				}
			: null;

	// Points the sidebar at an evaluator-day, the same as clicking a grid cell.
	function handleCalendarSelect(npi: number, day: string) {
		setSelectedCell({ npi, date: day });
		const resolved = resolveOfficeForCell(npi, day);
		if (resolved) setOfficeFilter(resolved);
	}

	function overlapsBooking(
		npi: number,
		start: Date,
		end: Date,
		ignoreId?: string,
	) {
		return (appointmentsByNpi?.[npi] ?? []).some(
			(a) =>
				a.id !== ignoreId &&
				start.getTime() < a.endTime.getTime() &&
				end.getTime() > a.startTime.getTime(),
		);
	}

	// Drag (or click) on empty calendar space stages a new slot for the sidebar
	// confirm button.
	function handleCalendarCreate(
		npi: number,
		day: string,
		start: Date,
		end: Date,
	) {
		if (overlapsBooking(npi, start, end)) {
			toast.error("Overlaps an existing appointment");
			return;
		}
		handleCalendarSelect(npi, day);
		setManualTime(formatInBusinessTime(start, "HH:mm"));
		setSelectedSlot({
			start,
			durationMinutes: (end.getTime() - start.getTime()) / MINUTE_MS,
		});
	}

	// Dragging or resizing a placeholder block in the calendar. Only opens the
	// confirmation, the move happens once the user confirms it.
	function handleCalendarMove(
		appt: CalendarBooking,
		npi: number,
		_day: string,
		newStart: Date,
		newEnd: Date,
	) {
		const unchanged =
			appt.startTime.getTime() === newStart.getTime() &&
			appt.endTime.getTime() === newEnd.getTime() &&
			appointmentsByNpi?.[npi]?.some((a) => a.id === appt.id);
		if (unchanged) return;
		if (overlapsBooking(npi, newStart, newEnd, appt.id)) {
			toast.error("Overlaps an existing appointment");
			return;
		}
		setPendingMove({
			appointmentId: appt.id,
			clientName: appt.clientName,
			evaluatorName: evaluatorByNpi.get(npi)?.providerName ?? "this evaluator",
			evaluatorNpi: npi,
			locationKey: appt.locationKey ?? office ?? "",
			oldStart: appt.startTime,
			newStart,
			newEnd,
		});
	}

	function handleConfirmMove() {
		if (!pendingMove) return;
		movePlaceholder.mutate({
			appointmentId: pendingMove.appointmentId,
			evaluatorNpi: pendingMove.evaluatorNpi,
			startTime: toBusinessWallClockString(pendingMove.newStart),
			endTime: toBusinessWallClockString(pendingMove.newEnd),
			locationKey: pendingMove.locationKey,
		});
	}

	const planOffice = api.schedulingHelper.planOffice.useMutation({
		onSuccess: () => {
			toast.success("Office planned");
			void utils.schedulingHelper.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to plan office", { description: error.message });
		},
	});

	const unplanOffice = api.schedulingHelper.unplanOffice.useMutation({
		onSuccess: () => {
			toast.success("Plan removed");
			void utils.schedulingHelper.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to remove plan", { description: error.message });
		},
	});

	const handleConfirm = () => {
		if (!selectedCell || !selectedSlot || !office || !effectiveClient) return;
		const end = new Date(
			selectedSlot.start.getTime() + selectedSlot.durationMinutes * 60000,
		);
		createPlaceholder.mutate({
			clientId: effectiveClient.id,
			evaluatorNpi: selectedCell.npi,
			startTime: toBusinessWallClockString(selectedSlot.start),
			endTime: toBusinessWallClockString(end),
			daEval: appointmentType,
			locationKey: office,
		});
	};

	const handlePlanOffice = () => {
		if (!selectedCell || !office) return;
		planOffice.mutate({
			evaluatorNpi: selectedCell.npi,
			date: selectedCell.date,
			officeKey: office,
		});
	};

	const handleUnplanOffice = () => {
		if (!selectedCell) return;
		unplanOffice.mutate({
			evaluatorNpi: selectedCell.npi,
			date: selectedCell.date,
		});
	};

	return (
		<div
			className={cn(
				"mx-auto flex w-full flex-col gap-4 pb-10",
				view !== "calendar" && "max-w-7xl",
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					{lockedClient ? (
						<ClientHeaderSection clientId={lockedClient.id} />
					) : (
						<h2 className="font-bold text-2xl">Schedule Appointment</h2>
					)}
				</div>
				<Button asChild variant="outline">
					<Link href="/scheduling">Back to Scheduling</Link>
				</Button>
			</div>

			<div
				className={cn(
					"grid grid-cols-1 gap-4 lg:items-start",
					view !== "calendar" && "lg:grid-cols-[1fr_380px]",
				)}
			>
				<div className="flex flex-col gap-4">
					<Card className="flex flex-col gap-3 overflow-visible p-4">
						<div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-3">
							{!lockedClient && (
								<div className="flex min-w-[200px] items-center gap-2">
									<Label className="text-muted-foreground text-xs">
										Client
									</Label>
									{pendingClient ? (
										<div className="flex items-center gap-2 text-sm">
											<span className="font-medium">
												{pendingClient.fullName}
											</span>
											<button
												className="text-muted-foreground text-xs underline"
												onClick={() => setPendingClient(null)}
												type="button"
											>
												change
											</button>
										</div>
									) : (
										<div className="w-64">
											<ClientSearchAndAdd
												addButtonLabel="Select"
												floating
												onAdd={(client) => setPendingClient(client)}
												placeholder="Search for a client..."
												type="real"
											/>
										</div>
									)}
								</div>
							)}

							<div className="flex items-center gap-2">
								<Label
									className="text-muted-foreground text-xs"
									htmlFor="office-select"
								>
									Office
								</Label>
								<Select
									onValueChange={(value) => {
										setOfficeFilter(value === "any" ? null : value);
										setSelectedSlot(null);
									}}
									value={officeFilter ?? "any"}
								>
									<SelectTrigger className="h-8 w-44" id="office-select">
										<SelectValue placeholder="Any office" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any office</SelectItem>
										<SelectItem value="Virtual">Virtual</SelectItem>
										{offices
											?.filter((o) => !o.archived)
											.map((o) => (
												<SelectItem key={o.key} value={o.key}>
													{o.prettyName}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<Label
									className="text-muted-foreground text-xs"
									htmlFor="type-select"
								>
									Type
								</Label>
								<Select
									disabled={office === "Virtual"}
									onValueChange={(value) =>
										setAppointmentType(value as AppointmentType)
									}
									value={appointmentType}
								>
									<SelectTrigger className="h-8 w-28" id="type-select">
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
							</div>

							<div className="flex items-center gap-1">
								<Button
									onClick={() => setView("calendar")}
									size="sm"
									variant={view === "calendar" ? "default" : "outline"}
								>
									Calendar
								</Button>
								<Button
									onClick={() => setView("evaluator")}
									size="sm"
									variant={view === "evaluator" ? "default" : "outline"}
								>
									By evaluator
								</Button>
								<Button
									onClick={() => setView("date")}
									size="sm"
									variant={view === "date" ? "default" : "outline"}
								>
									By date
								</Button>
							</div>

							<div className="flex items-center gap-1">
								<Button
									className="mr-1 h-8"
									disabled={weekOffset === 0}
									onClick={() => setWeekOffset(0)}
									size="sm"
									variant="outline"
								>
									Today
								</Button>
								<Button
									className="h-8 w-8"
									onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
									size="icon"
									variant="outline"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span className="min-w-[11ch] text-center text-sm">
									{dayStringToLocalDate(
										visibleDays[0] ?? "",
									).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
									})}{" "}
									–{" "}
									{dayStringToLocalDate(
										visibleDays[visibleDays.length - 1] ?? "",
									).toLocaleDateString(undefined, {
										month: "short",
										day: "numeric",
									})}
								</span>
								<Button
									className="h-8 w-8"
									onClick={() => setWeekOffset((w) => w + 1)}
									size="icon"
									variant="outline"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</Card>
					{(nextAvailable || filterToAssigned) && (
						<Card className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
							{nextAvailable && (
								<>
									<Sparkles className="h-4 w-4 text-success" />
									<span>
										Next available:{" "}
										<strong>{nextAvailable.evaluator.providerName}</strong>,{" "}
										{formatInBusinessTime(
											new Date(nextAvailable.start),
											"EEE M/d 'at' h:mm a",
										)}
									</span>
									<Button
										onClick={() =>
											pickSlot(
												nextAvailable.evaluator,
												nextAvailable.day,
												nextAvailable.start,
											)
										}
										size="sm"
										variant="outline"
									>
										Use this slot
									</Button>
								</>
							)}
							{filterToAssigned && (
								<button
									className="ml-auto text-muted-foreground text-xs underline"
									onClick={() => setShowAllEvaluators(true)}
									type="button"
								>
									Showing only the assigned evaluator. Show all
								</button>
							)}
						</Card>
					)}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-muted-foreground text-xs">
						<span className="font-medium">Key:</span>
						{[
							{ label: "Booked", swatch: "border-primary bg-primary" },
							{
								label: "Placeholder",
								swatch: "border-warning border-dashed bg-warning/15",
							},
							{ label: "Planned", swatch: "border-border bg-background" },
							{
								label: "Available",
								swatch: "border-success/40 bg-success/10",
							},
							{ label: "OOO", swatch: "border-transparent bg-muted" },
							{
								label: "Full",
								swatch: "border-destructive/40 bg-destructive/10",
							},
						].map(({ label, swatch }) => (
							<span className="flex items-center gap-1.5" key={label}>
								<span className={cn("h-3 w-3 rounded-sm border", swatch)} />
								{label}
							</span>
						))}
					</div>
					<TooltipProvider>
						<Card className="overflow-x-auto p-0">
							{view === "calendar" &&
							!isLoadingEvaluators &&
							typeAllowedEvaluators.length > 0 ? (
								<SchedulingCalendar
									appointmentsByNpi={appointmentsByNpi}
									assignedNpi={assignedNpi}
									days={visibleDays}
									defaultDurationMinutes={defaultDurationMinutesFor}
									evaluators={[...eligibleList, ...ineligibleList]}
									hiddenNpis={hiddenNpis}
									noteFor={calendarNoteFor}
									onChangeWeek={(delta) =>
										setWeekOffset((w) => Math.max(0, w + delta))
									}
									onCreate={handleCalendarCreate}
									onDelete={setPendingDeleteId}
									onMove={handleCalendarMove}
									onSelect={handleCalendarSelect}
									onToggleEvaluator={toggleEvaluator}
									pendingMove={
										pendingMove
											? {
													appointmentId: pendingMove.appointmentId,
													npi: pendingMove.evaluatorNpi,
													start: pendingMove.newStart,
													end: pendingMove.newEnd,
												}
											: null
									}
									preview={calendarPreview}
									windowsFor={calendarWindowsFor}
								/>
							) : view === "date" &&
								!isLoadingEvaluators &&
								typeAllowedEvaluators.length > 0 ? (
								<DateFirstView
									evaluators={eligibleList}
									loading={isLoadingAvailability || isLoadingAppointments}
									onPick={pickSlot}
									startsFor={openStartsFor}
									visibleDays={visibleDays}
								/>
							) : isLoadingEvaluators ? (
								<Skeleton className="m-4 h-64 w-full rounded-md" />
							) : typeAllowedEvaluators.length === 0 ? (
								<p className="p-4 text-muted-foreground text-sm">
									No evaluators allow {appointmentType} appointments.
								</p>
							) : (
								<div
									className="grid min-w-[900px]"
									style={{
										gridTemplateColumns: `180px repeat(${VISIBLE_DAYS}, 1fr)`,
									}}
								>
									<div className="sticky top-0 z-10 border-b bg-background p-2" />
									{visibleDays.map((day) => {
										const date = dayStringToLocalDate(day);
										const isToday = day === dateToDayString(startOfToday());
										return (
											<div
												className={`sticky top-0 z-10 border-b border-l bg-background p-2 text-center text-xs ${isToday ? "text-primary" : "text-muted-foreground"}`}
												key={day}
											>
												<div className="font-medium uppercase tracking-wide">
													{date.toLocaleDateString(undefined, {
														weekday: "short",
													})}
												</div>
												<div className="font-semibold text-foreground text-sm">
													{date.toLocaleDateString(undefined, {
														month: "numeric",
														day: "numeric",
													})}
												</div>
											</div>
										);
									})}

									{eligibleList.map((evaluator) => {
										const hasAvailability =
											isLoadingAvailability ||
											(hasAvailabilityInWindow.get(evaluator.npi) ?? true);
										return (
											<EvaluatorRow
												appointmentsLoading={isLoadingAppointments}
												availabilityLoading={isLoadingAvailability}
												cellStatus={cellStatus}
												evaluator={evaluator}
												hasAvailability={hasAvailability}
												key={evaluator.npi}
												onDropPlaceholder={handleDropPlaceholderDay}
												onSelectCell={(date) => {
													setSelectedCell({ npi: evaluator.npi, date });
													setSelectedSlot(null);
													const resolved = resolveOfficeForCell(
														evaluator.npi,
														date,
													);
													if (resolved) setOfficeFilter(resolved);
												}}
												selectedCell={selectedCell}
												visibleDays={visibleDays}
											/>
										);
									})}

									{ineligibleList.length > 0 && (
										<button
											className="col-span-full flex items-center gap-1 border-t bg-muted/30 p-2 text-left text-muted-foreground text-xs hover:bg-muted/50"
											onClick={() => setShowIneligible((v) => !v)}
											type="button"
										>
											{showIneligible ? (
												<ChevronDown className="h-3 w-3" />
											) : (
												<ChevronRight className="h-3 w-3" />
											)}
											{ineligibleList.length} evaluator
											{ineligibleList.length === 1 ? "" : "s"} not eligible for{" "}
											{effectiveClient?.fullName}
											{showIneligible ? "" : " (click to show)"}
										</button>
									)}

									{showIneligible &&
										ineligibleList.map((evaluator) => {
											const hasAvailability =
												isLoadingAvailability ||
												(hasAvailabilityInWindow.get(evaluator.npi) ?? true);
											return (
												<EvaluatorRow
													appointmentsLoading={isLoadingAppointments}
													availabilityLoading={isLoadingAvailability}
													cellStatus={cellStatus}
													evaluator={evaluator}
													hasAvailability={hasAvailability}
													key={evaluator.npi}
													onDropPlaceholder={handleDropPlaceholderDay}
													onSelectCell={(date) => {
														setSelectedCell({ npi: evaluator.npi, date });
														setSelectedSlot(null);
														const resolved = resolveOfficeForCell(
															evaluator.npi,
															date,
														);
														if (resolved) setOfficeFilter(resolved);
													}}
													selectedCell={selectedCell}
													visibleDays={visibleDays}
												/>
											);
										})}
								</div>
							)}
						</Card>
					</TooltipProvider>
				</div>

				{selectedCell && (
					<div className="flex flex-col gap-4 lg:sticky lg:top-4">
						<Card className="flex flex-col gap-3 p-4">
							<div className="flex items-center justify-between">
								<h3 className="font-semibold">
									{selectedEvaluator?.providerName ?? "Evaluator"} on{" "}
									{dayStringToLocalDate(selectedCell.date).toLocaleDateString()}
								</h3>
								<Button
									onClick={() => setSelectedCell(null)}
									size="icon"
									variant="ghost"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>

							{effectiveClient && !evaluatorEligibleForClient && (
								<Alert variant="destructive">
									<AlertTriangle />
									<AlertTitle>
										Evaluator not eligible for this client
									</AlertTitle>
									<AlertDescription>
										{selectedEvaluator?.providerName} doesn't match{" "}
										{effectiveClient.fullName}'s insurance or district rules.
										Scheduling here may need an override.
									</AlertDescription>
								</Alert>
							)}

							{officeConflict && (
								<Alert variant="destructive">
									<AlertTriangle />
									<AlertTitle>Already has an appointment this day</AlertTitle>
									<AlertDescription>
										{selectedEvaluator?.providerName} already has
										{officeConflict.placeholder
											? " a placeholder"
											: " an appointment"}{" "}
										at {officeConflict.officeName ?? officeConflict.locationKey}{" "}
										on{" "}
										{dayStringToLocalDate(
											selectedCell.date,
										).toLocaleDateString()}
										. Scheduling at a different office may not be possible.
									</AlertDescription>
								</Alert>
							)}

							<div className="flex items-center gap-2">
								{plannedEvent ? (
									<>
										<Badge variant="outline">
											Planned:{" "}
											{officeKeyToLabel.get(
												plannedEvent.officeKeys?.[0] ?? "",
											) ?? "Office"}
										</Badge>
										<Button
											disabled={unplanOffice.isPending}
											onClick={handleUnplanOffice}
											size="sm"
											variant="outline"
										>
											Remove plan
										</Button>
									</>
								) : (
									!alreadyBooked && (
										<Button
											disabled={!office || planOffice.isPending}
											onClick={handlePlanOffice}
											size="sm"
											variant="outline"
										>
											{planOffice.isPending
												? "Planning..."
												: "Plan this office"}
										</Button>
									)
								)}
							</div>
						</Card>

						<Card className="flex flex-col gap-3 p-4">
							<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
								<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									Pick a time
								</h4>
								<div className="flex items-center gap-1.5 text-sm">
									<Label
										className="text-muted-foreground"
										htmlFor="duration-input"
									>
										Duration
									</Label>
									<Input
										className="h-7 w-16"
										id="duration-input"
										min={5}
										onChange={(e) => {
											const value = Number(e.target.value);
											if (Number.isFinite(value) && value > 0) {
												setDurationOverride(value);
											}
										}}
										step={5}
										type="number"
										value={durationMinutes}
									/>
									<span className="text-muted-foreground">min</span>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Info className="h-3.5 w-3.5 text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent>
												{durationOverride !== null
													? "Manually overridden for this booking."
													: defaultDuration.source.kind === "evaluator-setting"
														? `From ${selectedEvaluator?.providerName ?? "this evaluator"}'s "${defaultDuration.source.key}" appointment duration setting.`
														: `App default - ${selectedEvaluator?.providerName ?? "this evaluator"} has no duration setting for ${appointmentType}.`}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
									{durationOverride !== null && (
										<button
											className="text-muted-foreground text-xs underline"
											onClick={() => setDurationOverride(null)}
											type="button"
										>
											reset
										</button>
									)}
								</div>
							</div>

							{isLoadingAvailability || isLoadingDayAppointments ? (
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
												{formatInBusinessTime(start, "h:mm a")}
											</Button>
										);
									})}
								</div>
							) : (
								<div className="flex flex-col gap-1.5">
									<p className="text-muted-foreground text-sm">
										{hasAllDayAvailability
											? "Marked available all day - pick a time:"
											: "No marked availability for this day/office - pick a time, or click the calendar below:"}
									</p>
									<div className="flex items-center gap-2">
										<Input
											className="w-28"
											onChange={(e) => setManualTime(e.target.value)}
											type="time"
											value={manualTime}
										/>
										<Button
											disabled={!manualSlot || !!manualSlotError}
											onClick={() =>
												manualSlot &&
												setSelectedSlot({
													start: manualSlot.start,
													durationMinutes,
												})
											}
											size="sm"
										>
											Use this time
										</Button>
									</div>
									{manualSlotError && (
										<p className="text-destructive text-xs">
											{manualSlotError}
										</p>
									)}
								</div>
							)}

							{selectedSlot && (
								<div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
									<div className="flex flex-wrap items-center gap-2 text-sm">
										<span>Confirm placeholder for</span>
										<Badge variant="secondary">
											{formatInBusinessTime(selectedSlot.start, "h:mm a")} -{" "}
											{formatInBusinessTime(
												new Date(
													selectedSlot.start.getTime() +
														selectedSlot.durationMinutes * 60000,
												),
												"h:mm a",
											)}
										</Badge>
										<Badge variant="outline">{appointmentType}</Badge>
										<Badge variant="outline">{office}</Badge>
									</div>

									{effectiveClient ? (
										<div className="flex items-center justify-between">
											<span className="text-sm">
												Client: <strong>{effectiveClient.fullName}</strong>
											</span>
											<Button
												disabled={createPlaceholder.isPending}
												onClick={handleConfirm}
											>
												{createPlaceholder.isPending
													? "Creating..."
													: "Create Placeholder"}
											</Button>
										</div>
									) : (
										<p className="text-muted-foreground text-sm">
											Select a client above to confirm this booking.
										</p>
									)}
								</div>
							)}
						</Card>

						<Card className="flex flex-col gap-3 p-4">
							<h3 className="font-semibold">
								{selectedEvaluator?.providerName ?? "Evaluator"}'s schedule on{" "}
								{dayStringToLocalDate(selectedCell.date).toLocaleDateString()}
							</h3>
							<p className="text-muted-foreground text-xs">
								Every appointment this evaluator has that day, across all
								offices, with their marked availability shown behind as a light
								overlay.
							</p>
							{isLoadingOfficeCalendar ? (
								<Skeleton className="h-48 w-full rounded-md" />
							) : (
								<CalendarDayView
									appointments={evaluatorDayAppointments}
									availability={evaluatorDayAvailability}
									colorMap={evaluatorDayColorMap}
									extraEvaluators={
										selectedEvaluator
											? [
													{
														npi: selectedEvaluator.npi,
														name: selectedEvaluator.providerName,
														isCurrentUser: true,
													},
												]
											: []
									}
									messages={{}}
									messagesLoading={false}
									onDeletePlaceholder={setPendingDeleteId}
									onMovePlaceholder={handleMovePlaceholderDrop}
									onSlotClick={(npi, minutes) => {
										if (npi === selectedCell.npi) {
											handleCalendarSlotClick(minutes);
										}
									}}
									showMessages={false}
								/>
							)}
						</Card>

						<AlertDialog
							onOpenChange={(open) => !open && setPendingMove(null)}
							open={!!pendingMove}
						>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Move this placeholder?</AlertDialogTitle>
									<AlertDialogDescription>
										{pendingMove && (
											<>
												Move{" "}
												{pendingMove.clientName
													? `${pendingMove.clientName}'s placeholder`
													: "this placeholder"}{" "}
												for {pendingMove.evaluatorName} from{" "}
												{formatInBusinessTime(
													pendingMove.oldStart,
													"MMM d, h:mm a",
												)}{" "}
												to{" "}
												{formatInBusinessTime(
													pendingMove.newStart,
													"MMM d, h:mm a",
												)}
												–{formatInBusinessTime(pendingMove.newEnd, "h:mm a")}?
											</>
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction onClick={handleConfirmMove}>
										Move
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog
							onOpenChange={(open) => !open && setPendingDeleteId(null)}
							open={!!pendingDeleteId}
						>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete this placeholder?</AlertDialogTitle>
									<AlertDialogDescription>
										This removes the hold and its calendar event. This can't be
										undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={() =>
											pendingDeleteId &&
											deletePlaceholder.mutate({
												appointmentId: pendingDeleteId,
											})
										}
										variant="destructive"
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						{IS_DEV && (
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
									{!dayAppointments ? (
										<Skeleton className="h-8 w-full rounded-md" />
									) : (
										<div className="flex flex-col gap-1 overflow-x-auto rounded-md border p-2 font-mono text-[10px]">
											{dayAppointments.map((appt) => (
												<div className="whitespace-nowrap" key={appt.id}>
													{formatInBusinessTime(
														appt.startTime,
														"M/d/yy h:mm a",
													)}
													-{formatInBusinessTime(appt.endTime, "h:mm a")} |
													office=
													{appt.locationKey ?? appt.officeName ?? "none"} |
													placeholder={String(appt.placeholder)}
												</div>
											))}
										</div>
									)}
								</CollapsibleContent>
							</Collapsible>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function ClientHeaderSection({ clientId }: { clientId: number }) {
	const { data: client, isLoading } = api.clients.getOne.useQuery({
		column: "id",
		value: clientId.toString(),
	});

	return (
		<ClientHeader
			client={client}
			isLoading={isLoading}
			onColorChange={() => {}}
			readOnly
			selectedColor={client?.color ?? null}
		/>
	);
}

function EvaluatorRow({
	evaluator,
	visibleDays,
	hasAvailability,
	availabilityLoading,
	appointmentsLoading,
	cellStatus,
	selectedCell,
	onSelectCell,
	onDropPlaceholder,
}: {
	evaluator: Evaluator;
	visibleDays: string[];
	hasAvailability: boolean;
	availabilityLoading: boolean;
	appointmentsLoading: boolean;
	cellStatus: (npi: number, day: string) => CellStatus;
	selectedCell: { npi: number; date: string } | null;
	onSelectCell: (day: string) => void;
	/**
	 * Called when a placeholder badge is dragged from one day to another in
	 * this evaluator's row - lets the caller confirm and persist the move.
	 */
	onDropPlaceholder: (args: {
		appointmentId: string;
		evaluatorNpi: number;
		day: string;
		startTime: Date;
		endTime: Date;
	}) => void;
}) {
	const isLoading = availabilityLoading || appointmentsLoading;
	const nameLabel = (
		<div
			className={`truncate border-t border-l p-2 text-sm ${hasAvailability ? "" : "text-muted-foreground"}`}
		>
			{evaluator.providerName}
		</div>
	);

	return (
		<>
			{hasAvailability ? (
				nameLabel
			) : (
				<Tooltip>
					<TooltipTrigger asChild>{nameLabel}</TooltipTrigger>
					<TooltipContent>
						No upcoming availability within {AVAILABILITY_WINDOW_DAYS} days
					</TooltipContent>
				</Tooltip>
			)}
			{visibleDays.map((day) => {
				const isSelected =
					selectedCell?.npi === evaluator.npi && selectedCell.date === day;
				const status = isLoading
					? { kind: "empty" as const, slotsLeft: [], full: false }
					: cellStatus(evaluator.npi, day);
				return (
					<button
						className={`border-t border-l p-1.5 text-left text-xs transition-colors hover:bg-muted/50 ${isSelected ? "bg-muted" : status.full ? "bg-destructive/10" : ""}`}
						key={day}
						onClick={() => onSelectCell(day)}
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault();
							const raw = e.dataTransfer.getData("text/plain");
							if (!raw) return;
							const payload = JSON.parse(raw) as {
								appointmentId: string;
								evaluatorNpi: number;
								startTime: string;
								endTime: string;
							};
							if (payload.evaluatorNpi !== evaluator.npi) return;
							onDropPlaceholder({
								appointmentId: payload.appointmentId,
								evaluatorNpi: payload.evaluatorNpi,
								day,
								startTime: new Date(payload.startTime),
								endTime: new Date(payload.endTime),
							});
						}}
						type="button"
					>
						{isLoading ? (
							<Skeleton className="h-5 w-full rounded-sm" />
						) : status.kind === "booked" ? (
							<Badge
								className={`w-full justify-center truncate ${status.placeholder ? "cursor-grab border-2 border-warning border-dashed bg-warning/15 text-warning active:cursor-grabbing dark:bg-warning/25" : ""}`}
								draggable={status.placeholder}
								onDragStart={
									status.placeholder
										? (e) => {
												e.dataTransfer.setData(
													"text/plain",
													JSON.stringify({
														appointmentId: status.id,
														evaluatorNpi: evaluator.npi,
														startTime: status.startTime.toISOString(),
														endTime: status.endTime.toISOString(),
													}),
												);
												e.dataTransfer.effectAllowed = "move";
											}
										: undefined
								}
								variant={status.placeholder ? "outline" : "default"}
							>
								{status.placeholder ? "plchldr: " : ""}
								{status.officeLabel}
							</Badge>
						) : status.kind === "planned" ? (
							<Badge
								className="w-full justify-center truncate"
								variant="outline"
							>
								Planned: {status.officeLabel}
							</Badge>
						) : status.kind === "available" ? (
							<Badge
								className="w-full justify-center truncate border-success/40 bg-success/10 text-success"
								title={status.officeLabels.join(", ")}
								variant="outline"
							>
								{status.officeLabels.length > 0
									? status.officeLabels.join(", ")
									: "Available"}
							</Badge>
						) : status.kind === "ooo" ? (
							<span className="block text-center text-muted-foreground/50">
								OOO
							</span>
						) : (
							<span className="block text-center text-muted-foreground/50">
								Unavailable
							</span>
						)}
						{!isLoading && <SlotsLine status={status} />}
					</button>
				);
			})}
		</>
	);
}

// "2 appts · Left: DA 3, EVAL 1", or "Full" in red once nothing else fits.
function SlotsLine({ status }: { status: CellStatus }) {
	const parts: string[] = [];
	if (status.kind === "booked") {
		parts.push(
			`${status.appointmentCount} appt${status.appointmentCount === 1 ? "" : "s"}`,
		);
	}
	if (status.full) parts.push("Full");
	else if (status.slotsLeft.length > 0) {
		parts.push(
			`Left: ${status.slotsLeft.map((s) => `${s.type} ${s.count}`).join(", ")}`,
		);
	}
	if (parts.length === 0) return null;
	return (
		<span
			className={`mt-0.5 block text-center text-[10px] ${status.full ? "font-medium text-destructive" : "text-muted-foreground"}`}
		>
			{parts.join(" · ")}
		</span>
	);
}

// Calendar-like alternative to the evaluator grid: each day lists the open
// start times per evaluator, so the earliest opening is visible at a glance.
function DateFirstView({
	visibleDays,
	evaluators,
	loading,
	startsFor,
	onPick,
}: {
	visibleDays: string[];
	evaluators: Evaluator[];
	loading: boolean;
	startsFor: (evaluator: Evaluator, day: string) => number[];
	onPick: (evaluator: Evaluator, day: string, start: number) => void;
}) {
	if (loading) return <Skeleton className="m-4 h-64 w-[calc(100%-2rem)]" />;
	return (
		<div
			className="grid min-w-[900px]"
			style={{ gridTemplateColumns: `repeat(${VISIBLE_DAYS}, 1fr)` }}
		>
			{visibleDays.map((day) => {
				const date = dayStringToLocalDate(day);
				const rows = evaluators
					.map((evaluator) => ({
						evaluator,
						starts: startsFor(evaluator, day),
					}))
					.filter((row) => row.starts.length > 0);
				return (
					<div
						className="flex flex-col gap-2 border-l p-2 first:border-l-0"
						key={day}
					>
						<div className="text-center text-xs">
							<div className="font-medium text-muted-foreground uppercase tracking-wide">
								{date.toLocaleDateString(undefined, { weekday: "short" })}
							</div>
							<div className="font-semibold text-sm">
								{date.toLocaleDateString(undefined, {
									month: "numeric",
									day: "numeric",
								})}
							</div>
						</div>
						{rows.length === 0 ? (
							<span className="text-center text-destructive text-xs">
								No openings
							</span>
						) : (
							rows.map(({ evaluator, starts }) => (
								<div className="flex flex-col gap-1" key={evaluator.npi}>
									<span className="truncate font-medium text-xs">
										{evaluator.providerName}
									</span>
									<div className="flex flex-wrap gap-1">
										{starts.map((start) => (
											<Button
												className="h-6 px-1.5 text-[11px]"
												key={start}
												onClick={() => onPick(evaluator, day, start)}
												size="sm"
												variant="outline"
											>
												{formatInBusinessTime(new Date(start), "h:mm a")}
											</Button>
										))}
									</div>
								</div>
							))
						)}
					</div>
				);
			})}
		</div>
	);
}
