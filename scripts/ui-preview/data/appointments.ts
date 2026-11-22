import { FAKE_EVALUATORS, FAKE_OFFICES } from "./practice";

const DAY = 86_400_000;
const NOW = new Date("2026-11-21T15:00:00.000Z").getTime();

const evaluatorName = FAKE_EVALUATORS[0]?.providerName ?? null;
const officeKey = FAKE_OFFICES[0]?.key ?? null;

/** One appointment per lifecycle state, so a client's appointment list shows every badge. */
const appointment = (
	id: string,
	days: number,
	overrides: Record<string, unknown> = {},
) => ({
	id,
	startTime: new Date(NOW + days * DAY),
	endTime: new Date(NOW + days * DAY + 3_600_000),
	cpt: "96136",
	daEval: "EVAL" as "DA" | "DAEVAL" | "EVAL",
	asdAdhd: "ASD" as "ADHD" | "ASD" | "ASD+ADHD",
	cancelled: false,
	rescheduled: false,
	placeholder: false,
	billingOnly: false,
	locationKey: officeKey,
	calendarEventTitle: null,
	confirmedAt: null,
	doNotRemind: false,
	evaluatorName,
	reminderCount: 0,
	arrivedAt: null,
	arrivedBy: null,
	startedAt: null,
	startedBy: null,
	leftAt: null,
	leftBy: null,
	...overrides,
});

const ALL_STATES = [
	appointment("appt-1", -30, {
		daEval: "DA",
		arrivedAt: new Date(NOW - 30 * DAY),
		startedAt: new Date(NOW - 30 * DAY + 600_000),
		leftAt: new Date(NOW - 30 * DAY + 3_600_000),
	}),
	appointment("appt-2", -14, { cancelled: true }),
	appointment("appt-3", -7, { rescheduled: true }),
	appointment("appt-4", 3, {
		confirmedAt: new Date(NOW - DAY),
		reminderCount: 2,
	}),
	appointment("appt-5", 10, { doNotRemind: true }),
	appointment("appt-6", 17, { placeholder: true, evaluatorName: null }),
	appointment("appt-7", 24, { billingOnly: true, locationKey: null }),
];

/** The first fake clients get a few appointments, the last (Every Flag) gets every state. */
export function appointmentsByClientId(input: unknown) {
	const { clientId } = input as { clientId: number };
	if (clientId === 200_006) return ALL_STATES;
	if (clientId % 3 === 0) return ALL_STATES.slice(3, 5);
	if (clientId % 3 === 1) return ALL_STATES.slice(0, 2);
	return [];
}
