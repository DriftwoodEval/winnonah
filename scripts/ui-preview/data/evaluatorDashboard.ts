import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const DAY = 86_400_000;
const NOW = new Date("2026-11-22T15:00:00.000Z").getTime();
const DUE_WEEKS = 4;
const people = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));

const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Rich-text-free note text, as the router returns after flattening the editor content. */
const NOTES = [
	null,
	"Waiting on school records.",
	"Parent asked for a call before the report goes out.",
	"Draft started. Needs cognitive scores added.",
];

/**
 * One row per case, spread so the table shows past due, due soon, far out, a custom due date,
 * a task-completed date, show-anyway, completed and archived rows.
 */
const CASES = [
	{ days: -75 },
	{ days: -50, lastTask: -45 },
	{ days: -31 },
	{ days: -20, dueOverride: 3 },
	{ days: -14 },
	{ days: -9, showAnyway: true },
	{ days: -3 },
	{ days: -1, lastTask: -1 },
	{ days: -40, completed: true },
	{ days: -60, archived: true },
	{ days: -80, archived: true, completed: true },
	{ days: 5 },
	{ days: 12 },
];

function row(c: (typeof CASES)[number], i: number) {
	const client = people[(i * 7) % people.length] as (typeof people)[number];
	const startTime = new Date(NOW + c.days * DAY);
	const lastTask =
		c.lastTask !== undefined ? dateOnly(NOW + c.lastTask * DAY) : null;
	const dueOverride =
		c.dueOverride !== undefined ? dateOnly(NOW + c.dueOverride * DAY) : null;
	const base = lastTask ?? dateOnly(startTime.getTime());
	const due =
		dueOverride ??
		dateOnly(new Date(`${base}T12:00:00.000Z`).getTime() + DUE_WEEKS * 7 * DAY);
	return {
		id: `eval-appt-${i}`,
		startTime,
		daEval: (["DA", "EVAL", "DAEVAL"] as const)[i % 3] ?? null,
		asdAdhd: (["ASD", "ADHD", "ASD+ADHD", null] as const)[i % 4] ?? null,
		clientFullName: client.fullName,
		clientHash: client.hash,
		lastTaskCompletedDate: lastTask,
		dueDateOverride: dueOverride,
		showAnyway: "showAnyway" in c,
		reportCompletedAt: "completed" in c ? new Date(NOW - 2 * DAY) : null,
		reportCompletedByName: "completed" in c ? "Preview User" : null,
		evaluatorDashboardArchivedAt:
			"archived" in c ? new Date(NOW - 10 * DAY) : null,
		noteContent: NOTES[i % NOTES.length] ?? null,
		effectiveDueDate: new Date(`${due}T05:00:00.000Z`),
		isAdmin: true,
	};
}

const ROWS = CASES.map(row);

/** Mirrors `evaluatorDashboard.getAppointments` for an admin (the preview user has every permission). */
export function getAppointments(raw: unknown) {
	const { tab = "active", preview = false } = (raw ?? {}) as {
		tab?: "active" | "archived";
		preview?: boolean;
	};
	if (preview) {
		return ROWS.filter(
			(r) =>
				!r.evaluatorDashboardArchivedAt &&
				!r.reportCompletedAt &&
				(r.showAnyway || r.effectiveDueDate.getTime() > NOW),
		).map((r) => ({ ...r, isAdmin: false }));
	}
	return ROWS.filter((r) =>
		tab === "archived"
			? r.evaluatorDashboardArchivedAt
			: !r.evaluatorDashboardArchivedAt,
	);
}
