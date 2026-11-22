import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;

const APPS = [
	"import_from_ta",
	"questionnaire_reminders",
	"appointment_reminders",
	"drive_sync",
	"punchlist_sync",
];

const LEVELS = [
	"INFO",
	"INFO",
	"SUCCESS",
	"WARNING",
	"INFO",
	"ERROR",
	"NOTICE",
];

const MESSAGES: Record<string, string[]> = {
	INFO: [
		"Checking client record",
		"Fetched appointment list",
		"Matched client by name",
	],
	SUCCESS: ["Saved changes", "Message sent"],
	NOTICE: ["Skipped, nothing to do"],
	WARNING: ["No phone number on file", "Address lookup returned a low score"],
	ERROR: ["Request timed out after 30s"],
};

const clientPool = FAKE_CLIENTS.filter((c) => !isNotesOnlyClient(c)).slice(
	0,
	12,
);

/** A stable fake uuid, e.g. 00000000-0000-4000-8000-000000000007. */
const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const RUNS = Array.from({ length: 40 }, (_, i) => {
	const startedAt = new Date(NOW.getTime() - i * 3 * HOUR);
	return {
		id: uuid(i + 1),
		app: APPS[i % APPS.length] as string,
		startedAt,
		lastLogAt: new Date(startedAt.getTime() + (2 + (i % 9) * 3) * MIN),
		errorCount: i % 6 === 0 ? 1 + (i % 3) : 0,
		warningCount: i % 4,
		clientCount: (i * 3) % 14,
	};
});

type Input = { app?: string; clientId?: number; limit: number; offset: number };

/** `runLogs.listRuns`: newest first, optionally one script. */
export const listRuns = (raw: unknown) => {
	const { app, limit, offset } = raw as Input;
	const all = app ? RUNS.filter((r) => r.app === app) : RUNS;
	return { rows: all.slice(offset, offset + limit), total: all.length };
};

export const LOG_APPS = [...APPS].sort();

const allLines = RUNS.flatMap((run, r) =>
	Array.from({ length: 8 }, (_, i) => {
		const level = LEVELS[(r + i) % LEVELS.length] as string;
		const msgs = MESSAGES[level] as string[];
		const client = clientPool[(r + i) % clientPool.length];
		const hasClient = i % 3 !== 2 && client;
		return {
			id: r * 8 + i + 1,
			runId: run.id,
			app: run.app,
			time: new Date(run.startedAt.getTime() + i * 20_000),
			level,
			source: `${run.app}.py:${40 + i * 7}`,
			message: msgs[i % msgs.length] as string,
			exception:
				level === "ERROR"
					? 'TimeoutError: request timed out\n  File "utils/ta.py", line 88, in fetch'
					: null,
			clientId: hasClient ? client.id : null,
			clientFirstName: hasClient ? client.firstName : null,
			clientLastName: hasClient ? client.lastName : null,
			clientHash: hasClient ? client.hash : null,
		};
	}),
);

const LEVEL_ORDER = [
	"TRACE",
	"DEBUG",
	"INFO",
	"NOTICE",
	"SUCCESS",
	"WARNING",
	"ERROR",
	"CRITICAL",
];

/** `runLogs.listLines`: one run oldest first, or every run newest first. */
export const listLines = (raw: unknown) => {
	const { runId, clientId, minLevel, limit, offset } = raw as {
		runId?: string;
		clientId?: number;
		minLevel: string;
		limit: number;
		offset: number;
	};
	const min = LEVEL_ORDER.indexOf(minLevel);
	const matching = allLines
		.filter((l) => !runId || l.runId === runId)
		.filter((l) => !clientId || l.clientId === clientId)
		.filter((l) => LEVEL_ORDER.indexOf(l.level) >= min);
	const ordered = runId ? matching : [...matching].reverse();
	return { rows: ordered.slice(offset, offset + limit), total: ordered.length };
};
