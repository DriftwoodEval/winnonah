import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import { FAKE_EVALUATORS, FAKE_OFFICES } from "./practice";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const people = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));
const evaluators = FAKE_EVALUATORS.filter((e) => !e.archived);
const offices = FAKE_OFFICES.filter((o) => !o.archived);
/** The preview user is the first evaluator. */
const CURRENT_NPI = evaluators[0]?.npi;

/** Business-day start (9:00 Eastern is 14:00 UTC in winter) for a "YYYY-MM-DD" date. */
const nineAm = (date: string) => new Date(`${date}T14:00:00.000Z`);

/** Appointment `n` on `date`: rotates evaluator, office, type and check-in progress. */
function appointmentOn(date: string, n: number) {
	const client = people[n % people.length] as (typeof people)[number];
	const evaluator = evaluators[
		n % evaluators.length
	] as (typeof evaluators)[number];
	const office = offices[n % offices.length] as (typeof offices)[number];
	const start = new Date(nineAm(date).getTime() + (n % 6) * HOUR);
	const progress = n % 4;
	return {
		id: `${date}-${n}`,
		startTime: start,
		endTime: new Date(start.getTime() + HOUR),
		locationKey: office.key,
		officeName: office.prettyName,
		daEval: (["DA", "EVAL", "DAEVAL"] as const)[n % 3] ?? null,
		asdAdhd: (["ASD", "ADHD", "ASD+ADHD"] as const)[n % 3] ?? null,
		confirmedAt: n % 2 === 0 ? new Date(start.getTime() - DAY) : null,
		clientName: client.fullName,
		clientHash: client.hash,
		clientDriveId: client.driveId,
		clientTaHash: null,
		clientPhone: client.phoneNumber,
		calendarEventTitle: null,
		evaluatorNpi: evaluator.npi,
		evaluatorName: evaluator.providerName,
		isCurrentUser: evaluator.npi === CURRENT_NPI,
		arrivedAt: progress >= 1 ? new Date(start.getTime() - 600_000) : null,
		arrivedBy: progress >= 1 ? "Front Desk" : null,
		startedAt: progress >= 2 ? start : null,
		startedBy: progress >= 2 ? evaluator.providerName : null,
		leftAt: progress >= 3 ? new Date(start.getTime() + HOUR) : null,
		leftBy: progress >= 3 ? "Front Desk" : null,
	};
}

const todayString = () => new Date().toISOString().slice(0, 10);
const COUNT_PER_DAY = 9;
const rowsFor = (date: string) =>
	Array.from({ length: COUNT_PER_DAY }, (_, n) => appointmentOn(date, n));

/** Mirrors `appointments.getDayAhead`: the user's own rows plus every office grouped by evaluator. */
export function dayAhead(raw: unknown) {
	const date =
		(raw as { asDate?: string } | undefined)?.asDate ?? todayString();
	const rows = rowsFor(date);
	const checkin = (npi: number) => ({
		arrivedAt: npi === CURRENT_NPI ? nineAm(date) : null,
		arrivedBy: npi === CURRENT_NPI ? "Preview User" : null,
		leftAt: null,
		leftBy: null,
	});
	return {
		hasEvaluatorAccount: true,
		myAppointments: rows.filter((r) => r.isCurrentUser),
		offices: offices.flatMap((office) => {
			const inOffice = rows.filter((r) => r.locationKey === office.key);
			if (inOffice.length === 0) return [];
			const byEvaluator = new Map<number, typeof inOffice>();
			for (const r of inOffice) {
				byEvaluator.set(r.evaluatorNpi, [
					...(byEvaluator.get(r.evaluatorNpi) ?? []),
					r,
				]);
			}
			return [
				{
					officeName: office.prettyName,
					locationKey: office.key,
					evaluators: [...byEvaluator].map(([npi, appts]) => ({
						name: appts[0]?.evaluatorName ?? "",
						npi,
						isCurrentUser: npi === CURRENT_NPI,
						checkin: checkin(npi),
						appointments: appts,
					})),
				},
			];
		}),
	};
}

const addDays = (date: string, days: number) =>
	new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY)
		.toISOString()
		.slice(0, 10);

/** Mirrors `appointments.getCalendarRange`: the same rotating appointments on every weekday of the range. */
export function calendarRange(raw: unknown) {
	const { startDate, endDate } = raw as { startDate: string; endDate: string };
	const rows = [];
	for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
		const weekday = new Date(`${d}T12:00:00.000Z`).getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		rows.push(...rowsFor(d));
	}
	return rows;
}

/** Mirrors `appointments.getEvaluatorCheckins`: every evaluator arrived on each past day. */
export function evaluatorCheckins(raw: unknown) {
	const { startDate, endDate } = raw as { startDate: string; endDate: string };
	const rows = [];
	for (
		let d = startDate;
		d <= endDate && d <= todayString();
		d = addDays(d, 1)
	) {
		for (const e of evaluators) {
			rows.push({
				evaluatorNpi: e.npi,
				date: d,
				arrivedAt: nineAm(d),
				arrivedBy: e.providerName,
				leftAt:
					d < todayString() ? new Date(nineAm(d).getTime() + 8 * HOUR) : null,
				leftBy: d < todayString() ? e.providerName : null,
			});
		}
	}
	return rows;
}

/** Mirrors `quo.getRecentMessages`: a short text thread for each requested phone number. */
export function recentMessages(raw: unknown) {
	const { phoneNumbers } = raw as { phoneNumbers: string[] };
	const now = Date.now();
	return Object.fromEntries(
		phoneNumbers.map((phone, i) => [
			phone,
			[
				{
					id: `m-${i}-1`,
					type: "message" as const,
					direction: "incoming" as const,
					text: "Hi, we are running about ten minutes late.",
					status: "received" as const,
					createdAt: new Date(now - 3 * HOUR).toISOString(),
					isAutomated: false,
				},
				{
					id: `m-${i}-2`,
					type: "message" as const,
					direction: "outgoing" as const,
					text: "No problem, see you soon.",
					status: "delivered" as const,
					createdAt: new Date(now - 2 * HOUR).toISOString(),
					isAutomated: false,
				},
			],
		]),
	);
}

export const greeterSchedule = offices.map((o, i) => ({
	location: o.key,
	name: ["Taylor Brooks", "Priya Nair", "Dana Okoye"][i % 3] ?? "Greeter",
	phone: i % 2 === 0 ? "864-555-0142" : null,
}));
