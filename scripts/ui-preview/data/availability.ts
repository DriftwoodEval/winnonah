import { FAKE_EVALUATORS, FAKE_OFFICES } from "./practice";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const offices = FAKE_OFFICES.filter((o) => !o.archived);

/** Staff accounts: one per active evaluator plus two non-evaluators. */
export const FAKE_USERS = [
	...FAKE_EVALUATORS.filter((e) => !e.archived).map((e) => ({
		email: e.email,
		name: e.providerName,
		evaluator: e,
	})),
	{ email: "front.desk@example.com", name: "Dana Okoye", evaluator: null },
	{ email: "billing@example.com", name: "Priya Nair", evaluator: null },
].map((u, i) => ({
	id: `user-${i + 1}`,
	name: u.name,
	email: u.email,
	emailVerified: null,
	image: null,
	savedPlaces: null,
	permissions: null,
	roleId: i === 0 ? 1 : 2,
	archived: false,
	claimedReportFolder: null,
	maxClaimedReports: null,
	phoneNumber: null,
	recentClients: null,
	preferences: null,
	lastSeenChangelogMarker: null,
	blockedEvaluatorNpis: null,
	listFilters: null,
	pinnedList: null,
	evaluator: u.evaluator,
}));

/** Query inputs reach fixtures as raw JSON, so dates are ISO strings. */
type Range = { startDate: string; endDate: string };

/** Business-day start (9:00 Eastern is 14:00 UTC in winter) of the UTC day containing `ms`. */
const nineAm = (ms: number) => Math.floor(ms / DAY) * DAY + 14 * HOUR;

/**
 * Availability windows for one person across a range: weekdays rotate through the offices, every
 * fifth weekday is out of office, and some days list two offices.
 */
export function eventsFor(personIndex: number, { startDate, endDate }: Range) {
	const events = [];
	const end = new Date(endDate).getTime();
	for (let t = new Date(startDate).getTime(); t < end; t += DAY) {
		const weekday = new Date(t).getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		const n = Math.floor(t / DAY) + personIndex;
		const start = new Date(nineAm(t));
		const base = {
			id: `ev-${personIndex}-${n}`,
			start,
			isAllDay: false,
			isPlanned: false,
			recurrence: undefined,
			recurringEventId: null,
		};
		if (n % 5 === 0) {
			events.push({
				...base,
				summary: "Out of office",
				end: new Date(start.getTime() + 8 * HOUR),
				isUnavailability: true,
			});
			continue;
		}
		const office = offices[n % offices.length] as (typeof offices)[number];
		const second = n % 4 === 0 ? offices[(n + 1) % offices.length] : undefined;
		const picked = second ? [office, second] : [office];
		events.push({
			...base,
			summary: `Available - ${picked.map((o) => o.prettyName).join(", ")}`,
			end: new Date(start.getTime() + 8 * HOUR),
			isUnavailability: false,
			officeKey: office.key,
			officeKeys: picked.map((o) => o.key),
		});
	}
	return events;
}

/** Mirrors `google.getAvailability` for the signed-in user (the first staff account). */
export const getAvailability = (raw: unknown) => eventsFor(0, raw as Range);

/** Mirrors `google.getTeamAvailability`: every staff member with their own events. */
export const getTeamAvailability = (raw: unknown) =>
	FAKE_USERS.map((u, i) => ({
		email: u.email,
		name: u.name,
		events: eventsFor(i, raw as Range),
	}));
