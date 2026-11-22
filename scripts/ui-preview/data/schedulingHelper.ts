import { eventsFor } from "./availability";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import { FAKE_EVALUATORS, FAKE_OFFICES } from "./practice";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const people = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));
const evaluators = FAKE_EVALUATORS.filter((e) => !e.archived);
const offices = FAKE_OFFICES.filter((o) => !o.archived);

/** Query inputs reach fixtures as raw JSON, so dates are ISO strings. */
type Range = { evaluatorNpis: number[]; start: string; end: string };

/** `schedulingHelper.getSchedulingQueueInfo`: the client's age, diagnosis and queue preferences. */
export function queueInfo(raw: unknown) {
	const { clientId } = raw as { clientId: number };
	const client = FAKE_CLIENTS.find((c) => c.id === clientId);
	return {
		appointmentsRequired: 2,
		dob: client?.dob ?? null,
		asdAdhd: client?.asdAdhd ?? null,
		office: offices[0]?.key ?? null,
		evaluatorNpi: evaluators[0]?.npi ?? null,
		code: null,
	};
}

/** `schedulingHelper.getAvailability`: availability windows keyed by evaluator NPI. */
export function availability(raw: unknown) {
	const { evaluatorNpis, start, end } = raw as Range;
	return Object.fromEntries(
		evaluatorNpis.map((npi) => {
			const index = evaluators.findIndex((e) => e.npi === npi);
			return [npi, eventsFor(index, { startDate: start, endDate: end })];
		}),
	);
}

/** Business-day start (9:00 Eastern is 14:00 UTC in winter) of the UTC day containing `ms`. */
const nineAm = (ms: number) => Math.floor(ms / DAY) * DAY + 14 * HOUR;

/** Booked appointments for one evaluator on one UTC day; every fourth is a placeholder hold. */
function bookedOn(npi: number, dayStart: number, n: number) {
	const weekday = new Date(dayStart).getUTCDay();
	if (weekday === 0 || weekday === 6) return [];
	const evaluatorIndex = evaluators.findIndex((e) => e.npi === npi);
	const office = offices[
		(n + evaluatorIndex) % offices.length
	] as (typeof offices)[number];
	return [0, 2, 2.5, 4].map((slot, i) => {
		const startTime = new Date(nineAm(dayStart) + slot * HOUR);
		const placeholder = (n + i) % 4 === 0;
		const client = people[
			(n * 3 + i + evaluatorIndex) % people.length
		] as (typeof people)[number];
		return {
			id: `${npi}-${dayStart}-${slot}`,
			evaluatorNpi: npi,
			date: startTime.toISOString().slice(0, 10),
			startTime,
			endTime: new Date(startTime.getTime() + HOUR + (i % 2) * 0.5 * HOUR),
			locationKey: office.key,
			daEval: (["DA", "EVAL", "DAEVAL"] as const)[(n + i) % 3] ?? null,
			asdAdhd: (["ASD", "ADHD", "ASD+ADHD"] as const)[(n + i) % 3] ?? null,
			officeName: office.prettyName,
			placeholder,
			clientName: placeholder ? null : client.fullName,
			clientHash: placeholder ? null : client.hash,
		};
	});
}

/** `schedulingHelper.getEvaluatorAppointmentsInRange`: booked appointments keyed by evaluator NPI. */
export function appointmentsInRange(raw: unknown) {
	const { evaluatorNpis, start, end } = raw as Range;
	const first = Math.floor(new Date(start).getTime() / DAY) * DAY;
	const last = new Date(end).getTime();
	return Object.fromEntries(
		evaluatorNpis.map((npi) => {
			const rows = [];
			for (let t = first, n = 0; t < last; t += DAY, n++) {
				rows.push(...bookedOn(npi, t, n));
			}
			return [npi, rows];
		}),
	);
}

/** Start of the UTC day for a "YYYY-MM-DD" date. */
const dayMs = (date: string) => new Date(`${date}T00:00:00.000Z`).getTime();

/** `schedulingHelper.getEvaluatorDayAppointments`: one evaluator's bookings on one day. */
export function dayAppointments(raw: unknown) {
	const { evaluatorNpi, date } = raw as { evaluatorNpi: number; date: string };
	return bookedOn(evaluatorNpi, dayMs(date), 1).map((a) => ({
		id: a.id,
		startTime: a.startTime,
		endTime: a.endTime,
		locationKey: a.locationKey,
		officeName: a.officeName,
		placeholder: a.placeholder,
	}));
}

/** `schedulingHelper.getOfficeCalendar`: every evaluator's bookings on one day, with check-in times. */
export function officeCalendar(raw: unknown) {
	const { date } = raw as { date: string };
	return evaluators.flatMap((e, i) =>
		bookedOn(e.npi, dayMs(date), i + 1).map((a) => ({
			id: a.id,
			startTime: a.startTime,
			endTime: a.endTime,
			daEval: a.daEval,
			asdAdhd: a.asdAdhd,
			confirmedAt: null,
			clientName: a.clientName ?? "Hold",
			clientHash: a.clientHash ?? "",
			clientPhone: null,
			locationKey: a.locationKey,
			officeName: a.officeName,
			evaluatorNpi: e.npi,
			evaluatorName: e.providerName,
			arrivedAt: null,
			arrivedBy: null,
			startedAt: null,
			startedBy: null,
			leftAt: null,
			leftBy: null,
			placeholder: a.placeholder,
			isCurrentUser: false,
		})),
	);
}
