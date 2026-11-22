import { FAKE_USERS } from "./availability";
import { adminReviewEnabled } from "./issues";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const HOUR = 3_600_000;

export const doc = (...paragraphs: string[]) => ({
	type: "doc",
	content: paragraphs.map((text) => ({
		type: "paragraph",
		content: [{ type: "text", text }],
	})),
});

const VERSIONS = [
	doc("Records requested from pediatrician."),
	doc(
		"Records requested from pediatrician.",
		"School report received, no prior testing.",
	),
	doc(
		"Records requested from pediatrician.",
		"School report received, no prior testing.",
		"Ready for evaluator review.",
	),
];

export const userAt = (i: number) =>
	FAKE_USERS[i % FAKE_USERS.length] as (typeof FAKE_USERS)[number];

/** `adminReview.getByClientId`: a review row for clients in the enabled list, else null. */
export const reviewByClientId = (clientId: unknown) => {
	const row = adminReviewEnabled.find((r) => r.clientId === clientId);
	if (!row) return null;
	return {
		clientId: row.clientId,
		content: VERSIONS[2],
		enabled: true,
		waiting: row.waiting,
		claimedUserEmail: row.claimedUserEmail,
		createdAt: new Date(NOW.getTime() - 72 * HOUR),
		updatedAt: new Date(NOW.getTime() - 2 * HOUR),
		updatedBy: userAt(0).email,
		submittedToNotesAt: null,
	};
};

/** `adminReview.getClaimHistory`: newest first. */
export const claimHistory = (raw: unknown) => {
	const { clientId } = raw as { clientId: number };
	const row = adminReviewEnabled.find((r) => r.clientId === clientId);
	if (!row?.claimedUserEmail) return [];
	const claimer = FAKE_USERS.find((u) => u.email === row.claimedUserEmail);
	const assigner = userAt(1);
	return [
		{
			id: 2,
			userEmail: row.claimedUserEmail,
			userName: row.claimedUserName,
			userImage: null,
			setBy: assigner.email,
			setByName: assigner.name,
			createdAt: new Date(NOW.getTime() - 30 * HOUR),
		},
		{
			id: 1,
			userEmail: userAt(2).email,
			userName: userAt(2).name,
			userImage: null,
			setBy: claimer?.email ?? userAt(0).email,
			setByName: claimer?.name ?? userAt(0).name,
			createdAt: new Date(NOW.getTime() - 60 * HOUR),
		},
	];
};

/** `adminReview.getHistory`: current version first, then older ones. */
export const reviewHistory = (raw: unknown) => {
	const { reviewId } = raw as { reviewId: number };
	if (!adminReviewEnabled.some((r) => r.clientId === reviewId)) return [];
	return [2, 1, 0].map((v, i) => {
		const user = userAt(i);
		return {
			id: i === 0 ? -1 : v,
			...(i === 0 ? { isCurrent: true } : {}),
			content: VERSIONS[v],
			updatedBy: user.email,
			createdAt: new Date(NOW.getTime() - (2 + i * 24) * HOUR),
			updatedByName: user.name,
			updatedByImage: null,
		};
	});
};

const REVIEWER_PERMISSIONS = { "clients:admin:review": true };

/** `users.getAll`: the fake staff plus the two reviewers named in `adminReviewEnabled`, all able to review. */
export const USERS_WITH_REVIEW = [
	...FAKE_USERS,
	{ email: "preview@example.com", name: "Preview User" },
	{ email: "taylor@example.com", name: "Taylor Brooks" },
].map((u, i) => ({
	...(FAKE_USERS[0] as (typeof FAKE_USERS)[number]),
	...u,
	id: `user-${i + 1}`,
	evaluator: null as never,
	permissions: REVIEWER_PERMISSIONS,
}));
