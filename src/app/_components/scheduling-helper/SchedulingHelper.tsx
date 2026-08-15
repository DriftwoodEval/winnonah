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
import {
	AlertTriangle,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Info,
	X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
	toFakeUtcDate,
} from "~/app/_components/day-ahead/CalendarGrid";
import type { SortedClient } from "~/lib/api-types";
import type { CalendarEvent } from "~/lib/google";
import { IS_DEV, toBusinessZonedTime } from "~/lib/utils";
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

type Evaluator = NonNullable<RouterOutputs["evaluators"]["getAll"]>[number];

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

function eventCoversDay(event: CalendarEvent, day: string): boolean {
	const dayStart = dayStringToLocalDate(day).getTime();
	const dayEnd = addDays(dayStringToLocalDate(day), 1).getTime();
	return event.start.getTime() < dayEnd && event.end.getTime() > dayStart;
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

type CellStatus =
	| { kind: "booked"; officeLabel: string; placeholder: boolean }
	| { kind: "planned"; officeLabel: string }
	| { kind: "available"; officeLabels: string[] }
	| { kind: "ooo" }
	| { kind: "empty" };

// How many VISIBLE_DAYS-wide pages forward (or back) of today a given date
// falls on, so a deep-linked date scrolls the grid to the right week.
function weekOffsetForDate(dateStr: string): number {
	const diffDays = Math.round(
		(dayStringToLocalDate(dateStr).getTime() - startOfToday().getTime()) /
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
	const { data: offices } = api.offices.getAll.useQuery();
	const { data: evaluators, isLoading: isLoadingEvaluators } =
		api.evaluators.getAll.useQuery();
	const { data: queueInfo } =
		api.schedulingHelper.getSchedulingQueueInfo.useQuery(
			{ clientId: lockedClient?.id ?? 0 },
			{ enabled: !!lockedClient },
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
	const [pendingClient, setPendingClient] = useState<SortedClient | null>(null);
	const [showDebug, setShowDebug] = useState(false);

	// Pre-fill office/type from whatever was already set on the /scheduling
	// queue row, once, after it loads.
	const [defaultsApplied, setDefaultsApplied] = useState(false);
	useEffect(() => {
		if (defaultsApplied || !lockedClient || queueInfo === undefined) return;
		const queuedType = appointmentTypeForQueueCode(queueInfo.code);
		if (queuedType) setAppointmentType(queuedType);
		if (queueInfo.office) setOfficeFilter(queueInfo.office);
		setDefaultsApplied(true);
	}, [lockedClient, queueInfo, defaultsApplied]);

	const office = officeFilter;

	// Virtual appointments are always DA (see parse_location_and_type in the
	// Python import - a "[V]" tag can only ever mean DA), so force it here too.
	useEffect(() => {
		if (office === "Virtual" && appointmentType !== "DA") {
			setAppointmentType("DA");
		}
	}, [office, appointmentType]);

	const typeAllowedEvaluators = useMemo(
		() =>
			(evaluators ?? [])
				.filter((e) =>
					isTypeAllowed(e.allowedAppointmentTypes as string[], appointmentType),
				)
				.toSorted((a, b) => a.providerName.localeCompare(b.providerName)),
		[evaluators, appointmentType],
	);

	const evaluatorNpis = useMemo(
		() => typeAllowedEvaluators.map((e) => e.npi),
		[typeAllowedEvaluators],
	);

	const rangeStart = useMemo(() => startOfToday(), []);
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
		const minEnd = addDays(rangeStart, AVAILABILITY_WINDOW_DAYS);
		const visibleEnd = addDays(visibleStart, VISIBLE_DAYS);
		return visibleEnd > minEnd ? visibleEnd : minEnd;
	}, [rangeStart, visibleStart]);

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

	const cellStatus = useMemo(() => {
		return (npi: number, day: string): CellStatus => {
			const booked = appointmentsByNpi?.[npi]?.find((a) => a.date === day);
			if (booked) {
				return {
					kind: "booked",
					officeLabel:
						booked.officeName ??
						officeKeyToLabel.get(booked.locationKey ?? "") ??
						booked.locationKey ??
						"Virtual",
					placeholder: booked.placeholder,
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
		};
	}, [appointmentsByNpi, availabilityByNpi, office, officeKeyToLabel]);

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

	const effectiveClient = lockedClient ?? pendingClient;

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
	const { eligibleList, ineligibleList } = useMemo(() => {
		if (!effectiveClient || !eligibleEvaluators) {
			return { eligibleList: typeAllowedEvaluators, ineligibleList: [] };
		}
		const eligibleNpis = new Set(eligibleEvaluators.map((e) => e.npi));
		const eligible: Evaluator[] = [];
		const ineligible: Evaluator[] = [];
		for (const evaluator of typeAllowedEvaluators) {
			(eligibleNpis.has(evaluator.npi) ? eligible : ineligible).push(evaluator);
		}
		return { eligibleList: eligible, ineligibleList: ineligible };
	}, [typeAllowedEvaluators, effectiveClient, eligibleEvaluators]);

	const previewAppointment: CalAppt | null = useMemo(() => {
		if (!selectedSlot || !selectedCell || !office || !selectedEvaluator) {
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
			arrivedNote: null,
			startedAt: null,
			startedBy: null,
			startedNote: null,
			leftAt: null,
			leftBy: null,
			leftNote: null,
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

	const evaluatorDayColorMap = useMemo(
		() => buildColorMap(evaluatorDayAppointments),
		[evaluatorDayAppointments],
	);

	// Low-opacity layer behind the appointment blocks, showing the selected
	// evaluator's full marked availability that day across every office.
	const evaluatorDayAvailability: AvailabilityWindow[] = useMemo(() => {
		if (!selectedCell || !availabilityByNpi) return [];
		const events = availabilityByNpi[selectedCell.npi] ?? [];
		const day = dayStringToLocalDate(selectedCell.date);
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
					const start = new Date(day);
					start.setHours(DAY_START, 0, 0, 0);
					const end = new Date(day);
					end.setHours(DAY_END, 0, 0, 0);
					return {
						evaluatorNpi: selectedCell.npi,
						start: toFakeUtcDate(start),
						end: toFakeUtcDate(end),
					};
				}
				return {
					evaluatorNpi: selectedCell.npi,
					start: toFakeUtcDate(event.start),
					end: toFakeUtcDate(event.end),
				};
			});
	}, [selectedCell, availabilityByNpi]);

	const busyRanges = useMemo(
		() =>
			(dayAppointments ?? [])
				.map((appt) => {
					const start = toBusinessZonedTime(appt.startTime);
					const end = toBusinessZonedTime(appt.endTime);
					if (!start || !end) return null;
					return { start: start.getTime(), end: end.getTime() };
				})
				.filter((range): range is { start: number; end: number } => !!range),
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
		if (!selectedCell) return null;
		const [hours, minutes] = manualTime.split(":").map(Number);
		const start = dayStringToLocalDate(selectedCell.date);
		start.setHours(hours ?? 9, minutes ?? 0, 0, 0);
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

	// Clicking directly on the evaluator's calendar preview picks that time,
	// snapped to the nearest half hour, as long as it doesn't overlap an
	// existing appointment - same rule as the manual time input.
	function handleCalendarSlotClick(minutesFromMidnight: number) {
		if (!selectedCell) return;
		const snapped =
			Math.round(minutesFromMidnight / MANUAL_TIME_SNAP_MINUTES) *
			MANUAL_TIME_SNAP_MINUTES;
		const start = dayStringToLocalDate(selectedCell.date);
		start.setHours(0, snapped, 0, 0);
		const end = new Date(start.getTime() + durationMinutes * 60000);
		const error = manualSlotErrorFor(start, end);
		if (error) {
			toast.error(error);
			return;
		}
		setManualTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
		setSelectedSlot({ start, durationMinutes });
	}

	const utils = api.useUtils();

	const createPlaceholder = api.schedulingHelper.createPlaceholder.useMutation({
		onSuccess: () => {
			toast.success("Placeholder appointment created");
			setSelectedSlot(null);
			setSelectedCell(null);
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
			startTime: toNaiveWallClockString(selectedSlot.start),
			endTime: toNaiveWallClockString(end),
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
		<div className="mx-auto flex max-w-7xl flex-col gap-4 pb-10">
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

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">
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
										{offices?.map((o) => (
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
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
						<Badge variant="default">Booked</Badge>
						<Badge variant="secondary">Placeholder</Badge>
						<Badge variant="outline">Planned</Badge>
						<Badge
							className="border-success/40 bg-success/10 text-success"
							variant="outline"
						>
							Available
						</Badge>
						<span className="text-muted-foreground/50">OOO</span>
					</div>
					<TooltipProvider>
						<Card className="overflow-x-auto p-0">
							{isLoadingEvaluators ? (
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

							{alreadyBooked &&
								office !== "Virtual" &&
								alreadyBooked.locationKey !== office && (
									<Alert variant="destructive">
										<AlertTriangle />
										<AlertTitle>Already has an appointment this day</AlertTitle>
										<AlertDescription>
											{selectedEvaluator?.providerName} already has
											{alreadyBooked.placeholder
												? " a placeholder"
												: " an appointment"}{" "}
											at {alreadyBooked.officeName ?? alreadyBooked.locationKey}{" "}
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
												{start.toLocaleTimeString([], {
													hour: "numeric",
													minute: "2-digit",
												})}
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
									onSlotClick={(npi, minutes) => {
										if (npi === selectedCell.npi) {
											handleCalendarSlotClick(minutes);
										}
									}}
									showMessages={false}
								/>
							)}
						</Card>

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
													{new Date(appt.startTime).toLocaleString()}-
													{new Date(appt.endTime).toLocaleString()} | office=
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
}: {
	evaluator: Evaluator;
	visibleDays: string[];
	hasAvailability: boolean;
	availabilityLoading: boolean;
	appointmentsLoading: boolean;
	cellStatus: (npi: number, day: string) => CellStatus;
	selectedCell: { npi: number; date: string } | null;
	onSelectCell: (day: string) => void;
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
					? { kind: "empty" as const }
					: cellStatus(evaluator.npi, day);
				return (
					<button
						className={`border-t border-l p-1.5 text-left text-xs transition-colors hover:bg-muted/50 ${isSelected ? "bg-muted" : ""}`}
						key={day}
						onClick={() => onSelectCell(day)}
						type="button"
					>
						{isLoading ? (
							<Skeleton className="h-5 w-full rounded-sm" />
						) : status.kind === "booked" ? (
							<Badge
								className="w-full justify-center truncate"
								variant={status.placeholder ? "secondary" : "default"}
							>
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
					</button>
				);
			})}
		</>
	);
}
