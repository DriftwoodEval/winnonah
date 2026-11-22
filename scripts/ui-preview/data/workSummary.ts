import { FAKE_USERS } from "./availability";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import { FAKE_EVALUATORS } from "./practice";

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = new Date("2026-11-21T15:00:00.000Z").getTime();

const evaluators = FAKE_EVALUATORS.filter((e) => !e.archived);
const staffNames = FAKE_USERS.map((u) => u.name ?? u.email);
const people = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));

/** Expected minutes per appointment type, used when an evaluator has no override. */
export const DURATION_DEFAULTS: Record<string, number> = {
	DA: 60,
	"EVAL/young": 75,
	"EVAL/older": 90,
	default: 60,
};

/** Appointment columns the work summary groups by: DA, then type/diagnosis/age group. */
const COLUMNS = [
	"DA",
	"EVAL/ASD/young",
	"EVAL/ASD/older",
	"EVAL/ADHD/older",
	"DAEVAL/ASD/young",
] as const;

/** `workSummary.getSummary`: four weeks of counts per evaluator, plus check-in and timing stats. */
export function summary() {
	return {
		appointments: evaluators.map((e, i) => ({
			npi: e.npi,
			name: e.providerName,
			durations: (i === 1 ? { DA: 45, "EVAL/ASD/older": 100 } : {}) as Record<
				string,
				number
			>,
			weeklyData: Object.fromEntries(
				COLUMNS.map((col, c) => [
					col,
					[0, 1, 2, 3].map((w) => (i + c + w) % 5),
				]),
			),
			loggedWeeklyMinutes: [0, 1, 2, 3].map((w) => 600 + ((i + w) % 4) * 120),
		})),
		reports: staffNames
			.slice(0, 3)
			.map((name, i) => ({ name, count: 4 + i * 3 })),
		checkins: staffNames.map((name, i) => ({
			name,
			clientArrived: 30 + i * 4,
			clientStarted: 28 + i * 3,
			clientLeft: 27 + i * 4,
			evaluatorArrived: i < 3 ? 18 : 0,
			evaluatorLeft: i < 3 ? 17 : 0,
			outOfOrder: i % 3,
		})),
		timing: evaluators.map((e, i) => ({
			npi: e.npi,
			name: e.providerName,
			avgDurationDiff: -5 + i * 6,
			medianDurationDiff: -4 + i * 5,
			durationSampleSize: 20 + i,
			avgLateStart: 2 + i * 3,
			medianLateStart: 1 + i * 2,
			lateStartSampleSize: 24 + i,
		})),
		dayLateness: evaluators.map((e, i) => ({
			npi: e.npi,
			name: e.providerName,
			avgLateness: -10 + i * 8,
			medianLateness: -8 + i * 7,
			sampleSize: 12,
		})),
		durationDefaults: DURATION_DEFAULTS,
	};
}

/** `workSummary.listAppointments`: 90 past appointments covering every check-in state. */
export function listAppointments() {
	return Array.from({ length: 90 }, (_, n) => {
		const client = people[n % people.length] as (typeof people)[number];
		const evaluator = evaluators[
			n % evaluators.length
		] as (typeof evaluators)[number];
		const start = new Date(
			NOW - (1 + Math.floor(n / 3)) * DAY - (n % 3) * 3_600_000,
		);
		const progress = n % 5;
		const cancelled = n % 11 === 0;
		const arrivedAt =
			progress >= 1 ? new Date(start.getTime() - 5 * MIN) : null;
		const startedAt =
			progress >= 2 ? new Date(start.getTime() + (n % 7) * MIN) : null;
		const leftAt =
			progress >= 3 && startedAt
				? new Date(startedAt.getTime() + (50 + (n % 6) * 10) * MIN)
				: null;
		const projectedMinutes = [60, 75, 90][n % 3] as number;
		return {
			id: String(9000 + n),
			startTime: start,
			daEval: (["DA", "EVAL", "DAEVAL"] as const)[n % 3] ?? null,
			asdAdhd: (["ASD", "ADHD", "ASD+ADHD", null] as const)[n % 4] ?? null,
			cancelled,
			clientName: client.fullName,
			clientHash: client.hash,
			clientActive: client.status,
			evaluatorNpi: evaluator.npi,
			evaluatorName: evaluator.providerName,
			arrivedAt,
			startedAt,
			leftAt,
			arrivedByName: arrivedAt
				? (staffNames[n % staffNames.length] ?? null)
				: null,
			startedByName: startedAt
				? (staffNames[(n + 1) % staffNames.length] ?? null)
				: null,
			leftByName: leftAt
				? (staffNames[(n + 2) % staffNames.length] ?? null)
				: null,
			status: cancelled ? "Cancelled" : "Scheduled",
			ageGroup: n % 2 === 0 ? "young" : "older",
			projectedMinutes,
			loggedMinutes:
				startedAt && leftAt
					? (leftAt.getTime() - startedAt.getTime()) / MIN
					: undefined,
			lateStartMinutes: startedAt
				? (startedAt.getTime() -
						Math.max(start.getTime(), arrivedAt?.getTime() ?? 0)) /
					MIN
				: undefined,
		};
	});
}
