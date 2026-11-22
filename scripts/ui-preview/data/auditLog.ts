import { FAKE_USERS } from "./availability";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const MIN = 60_000;

const clientPool = FAKE_CLIENTS.filter((c) => !isNotesOnlyClient(c)).slice(
	0,
	10,
);

/** Action name, an optional detail builder, and an optional failure message. */
const TEMPLATES: {
	action: string;
	needsClient: boolean;
	detail?: (i: number) => unknown;
	error?: string;
}[] = [
	{
		action: "clients.update",
		needsClient: true,
		detail: (i) => ({
			phoneNumber: {
				from: "+15555550100",
				to: `+1555555${String(i).padStart(4, "0")}`,
			},
			notes: { from: null, to: "Prefers morning appointments" },
		}),
	},
	{
		action: "appointments.updateStatus",
		needsClient: true,
		detail: () => ({ status: { from: "scheduled", to: "confirmed" } }),
	},
	{
		action: "reports.claim",
		needsClient: true,
		detail: () => ({ reportType: "ADHD" }),
	},
	{
		action: "internal.failure.update",
		needsClient: true,
		detail: () => ({ reason: "no_show", failedDate: "2026-11-18" }),
	},
	{
		action: "python.gcal.event_deleted",
		needsClient: true,
		detail: () => ({ oldEventId: "evt_9f3a", reason: "appointment_cancelled" }),
	},
	{
		action: "settings.offices.update",
		needsClient: false,
		detail: () => ({ prettyName: { from: "Main", to: "Main Street" } }),
	},
	{
		action: "quo.sendMessage",
		needsClient: true,
		error: "Phone number is not a mobile line",
	},
	{
		action: "users.invite",
		needsClient: false,
		detail: () => ({ email: "new.hire@example.com", roleId: 2 }),
	},
];

const ROWS = Array.from({ length: 120 }, (_, i) => {
	const t = TEMPLATES[i % TEMPLATES.length] as (typeof TEMPLATES)[number];
	const user = FAKE_USERS[i % FAKE_USERS.length] as (typeof FAKE_USERS)[number];
	const client = t.needsClient ? clientPool[i % clientPool.length] : undefined;
	return {
		id: 1000 - i,
		createdAt: new Date(NOW.getTime() - i * 37 * MIN),
		userId: user.id,
		userEmail: user.email,
		impersonatedBy: i % 17 === 0 ? (FAKE_USERS[0]?.email ?? null) : null,
		action: t.action,
		clientId: client?.id ?? null,
		detail: t.detail ? t.detail(i) : null,
		success: !t.error,
		errorMessage: t.error ?? null,
		userName: user.name,
		clientFirstName: client?.firstName ?? null,
		clientLastName: client?.lastName ?? null,
		clientHash: client?.hash ?? null,
	};
});

export const AUDIT_ACTION_NAMES = [
	...new Set(TEMPLATES.map((t) => t.action)),
].sort();

export const AUDIT_USERS = FAKE_USERS.map((u) => ({
	userId: u.id,
	userEmail: u.email,
	userName: u.name,
}));

/** `auditLog.list`: newest first, with the same filters as the real router. Dates arrive as ISO strings. */
export const auditList = (raw: unknown) => {
	const { userId, clientId, action, from, to, limit, offset } = raw as {
		userId?: string;
		clientId?: number;
		action?: string;
		from?: string;
		to?: string;
		limit: number;
		offset: number;
	};
	const matching = ROWS.filter((r) => !userId || r.userId === userId)
		.filter((r) => !clientId || r.clientId === clientId)
		.filter((r) => {
			if (!action) return true;
			return action.endsWith(".*")
				? r.action.startsWith(action.slice(0, -1))
				: r.action === action;
		})
		.filter((r) => !from || r.createdAt >= new Date(from))
		.filter((r) => !to || r.createdAt <= new Date(to));
	return {
		rows: matching.slice(offset, offset + limit),
		total: matching.length,
	};
};
