import { FAKE_USERS } from "./availability";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const DAY = 86_400_000;
const people = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));

const field = (
	name: "username" | "password",
	label: "User" | "Password",
	secret: boolean,
	value: string,
) => ({
	name,
	label,
	secret,
	value,
});

const customFields = (username: string) => [
	field("username", "User", false, username),
	field("password", "Password", true, "not-a-real-password"),
];

/** `logins.list`: made-up credentials only. The built-in QGlobal row also shows the Pearson code button. */
export const LOGINS = [
	{
		id: 1,
		builtInKey: "qglobal",
		name: "Q-global",
		url: "https://qglobal.example.com",
		notes: "Shared by all evaluators. Codes arrive by email.",
		fields: [
			field("username", "User", false, "practice-qglobal"),
			field("password", "Password", true, "not-a-real-password"),
		],
		canEdit: true,
		canDelete: false,
	},
	{
		id: 2,
		builtInKey: null,
		name: "Availity",
		url: "https://availity.example.com",
		notes: "Insurance eligibility checks.",
		fields: customFields("front.desk"),
		canEdit: true,
		canDelete: true,
	},
	{
		id: 3,
		builtInKey: null,
		name: "State Medicaid Portal",
		url: "https://medicaid.example.gov",
		notes: "",
		fields: customFields("billing.team"),
		canEdit: true,
		canDelete: true,
	},
	{
		id: 4,
		builtInKey: null,
		name: "Fax Service",
		url: "",
		notes: "View only for most staff.",
		fields: customFields("office.fax"),
		canEdit: false,
		canDelete: false,
	},
];

/** `logins.permissionList`: names for the access pickers. */
export const LOGIN_PERMISSION_LIST = LOGINS.map(({ id, name }) => ({
	id,
	name,
}));

/** `logins.history`: newest first, one entry of each kind. Credential values are never recorded. */
export function loginHistory(raw: unknown) {
	const { id } = raw as { id: number };
	const login = LOGINS.find((l) => l.id === id);
	const by = (i: number) => FAKE_USERS[i % FAKE_USERS.length]?.name ?? "Staff";
	const entries = [
		{ action: "updated", detail: { changedCredentials: ["Password"] } },
		{ action: "access", detail: { access: { view: [1, 2], edit: [1] } } },
		{ action: "updated", detail: { details: { url: {}, notes: {} } } },
		{ action: "created", detail: null },
	] as const;
	return entries.map((e, i) => ({
		id: 100 - i,
		loginId: id,
		loginName: login?.name ?? "Login",
		action: e.action,
		detail: e.detail,
		changedBy: by(i),
		createdAt: new Date(NOW.getTime() - (i * 9 + 2) * DAY),
	}));
}

const CATEGORIES = [
	"Referral",
	"Records Request",
	"Insurance",
	"Insurance Denial",
	"Insurance Approval",
	"Status Update Request",
	"Patient Documents",
	"Unsure",
] as const;

const linkFor = (
	faxId: number,
	n: number,
	rejected: boolean,
	manual: boolean,
) => {
	const client = people[n % people.length] as (typeof people)[number];
	return {
		id: faxId * 10 + n,
		faxCategorizationId: faxId,
		clientId: client.id,
		source: manual ? ("manual" as const) : ("llm" as const),
		matchedName: client.fullName,
		confidence: "0.9200",
		confirmed: !rejected,
		rejected,
		createdAt: new Date(NOW.getTime() - faxId * 3_600_000),
		reviewedBy: null,
		client: { id: client.id, hash: client.hash, fullName: client.fullName },
	};
};

const FAXES = Array.from({ length: 18 }, (_, i) => {
	const id = i + 1;
	const llm = CATEGORIES[i % CATEGORIES.length];
	const reviewed = i % 3 === 2;
	const changedCategory = reviewed && i % 2 === 0;
	return {
		id,
		driveFileId: `drive-fax-${id}`,
		fileName: `Fax_2026-11-${String(22 - (i % 20)).padStart(2, "0")}_${String(id).padStart(4, "0")}.pdf`,
		discoveredAt: new Date(NOW.getTime() - i * 5 * 3_600_000),
		category:
			(changedCategory ? CATEGORIES[(i + 1) % CATEGORIES.length] : llm) ?? null,
		llmCategory: llm ?? null,
		confidence: (0.55 + (i % 9) * 0.05).toFixed(4),
		status: reviewed ? ("reviewed" as const) : ("pending" as const),
		extractedText: `Re: patient referral for evaluation. Please schedule at the earliest opening. Fax page ${id} of 3.`,
		reviewedAt: reviewed ? new Date(NOW.getTime() - i * 2 * 3_600_000) : null,
		reviewedBy: reviewed ? (FAKE_USERS[0]?.email ?? null) : null,
		reprocessRequestedAt: null,
		lastReprocessedAt: null,
		links: [
			linkFor(id, i, false, false),
			...(i % 4 === 1 ? [linkFor(id, i + 5, true, false)] : []),
			...(reviewed && i % 4 === 2 ? [linkFor(id, i + 7, false, true)] : []),
		],
		reviewedByName: reviewed ? (FAKE_USERS[0]?.name ?? null) : null,
	};
});

/** `faxCategorization.list`: newest first, optionally one status. */
export function faxList(raw: unknown) {
	const { status } = (raw ?? {}) as { status?: "pending" | "reviewed" };
	return FAXES.filter((f) => !status || f.status === status);
}

export const faxPendingCount = () =>
	FAXES.filter((f) => f.status === "pending").length;
