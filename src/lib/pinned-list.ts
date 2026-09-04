import { z } from "zod";
import { isClientColor } from "./colors";
import {
	type DashboardClient,
	type DashboardSection,
	SECTION_NEEDS_OUTREACH,
	SECTION_REACHED_OUT_NEEDS_REVIEW,
	SECTION_RECORDS_REQUESTED_NOT_RETURNED,
} from "./dashboard";
import type { FullClientInfo } from "./models";

/**
 * A single list a user can "pin" to walk through client by client. Only one is
 * pinned at a time (stored on `users.pinnedList`). Insurance Review carries no
 * filter state here: the Mine/Waiting toggles live in
 * `users.listFilters["insuranceReview"]` and are re-applied when the list is
 * resolved, so a pinned Insurance Review list always matches the dashboard.
 */
export const pinnedListSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("dashboardSection"), title: z.string() }),
	z.object({ kind: z.literal("insuranceReview") }),
]);

export type PinnedList = z.infer<typeof pinnedListSchema>;

export function pinnedListLabel(pinned: PinnedList): string {
	return pinned.kind === "insuranceReview" ? "Insurance Review" : pinned.title;
}

/** Outreach sections deep-link to the referral tab, matching Dashboard.tsx. */
function sectionTab(title: string): string | undefined {
	return title === SECTION_NEEDS_OUTREACH ||
		title === SECTION_REACHED_OUT_NEEDS_REVIEW
		? "referral"
		: undefined;
}

export interface PinnedListEntry {
	hash: string;
	name: string;
	tab?: string;
	/** Client color key, when set. */
	color?: string;
	/** Insurance Review only: the client is waiting on something. */
	waiting?: boolean;
	/** Blocker/alert labels, rendered as destructive chips (same as the dashboard). */
	chips: string[];
	/** Muted supporting text lines (matched sections, extra info, claimed by, ...). */
	meta: string[];
	/** A single line rendered in the danger color (dashboard `dangerInfo`). */
	danger?: string;
}

interface ResolveArgs {
	dashboardSections?: DashboardSection[];
	insuranceClients?: {
		clientHash: string;
		clientName: string | null;
		claimedUserName: string | null;
		claimedUserEmail: string | null;
		waiting: boolean | null;
	}[];
	insuranceFilters?: string[];
	userEmail?: string | null;
}

/** First word of a name, matching how the dashboard shortens "Claimed by". */
function firstName(name: string): string {
	return name.split(" ")[0] ?? name;
}

/**
 * Turns one dashboard-section client into a list entry, carrying the same
 * badges and supporting text the dashboard row shows for that section.
 */
function dashboardEntry(
	raw: DashboardClient,
	sectionTitle: string,
	tab: string | undefined,
): PinnedListEntry {
	const c = raw as FullClientInfo & DashboardClient;
	const isOutreach =
		sectionTitle === SECTION_NEEDS_OUTREACH ||
		sectionTitle === SECTION_REACHED_OUT_NEEDS_REVIEW;
	const isRecordsNotReturned =
		sectionTitle === SECTION_RECORDS_REQUESTED_NOT_RETURNED;

	const chips: string[] = (c.failures ?? []).map((f) => f.reason);
	if (isRecordsNotReturned && c.evaluationInProcess)
		chips.push("Eval In Process");
	if (c.autismStop) chips.push("Autism Stop");
	if (c.pause) chips.push("Paused");
	const attempts = c.referralData?.outreachAttempts?.length ?? 0;
	if (sectionTitle === SECTION_NEEDS_OUTREACH && attempts > 0) {
		chips.push(`${attempts}/3 attempts`);
	}

	const meta: string[] = [];
	const language = c.language ?? c.Language;
	if (isRecordsNotReturned && c.asdAdhd) meta.push(c.asdAdhd);
	if (isOutreach && language && language.toLowerCase() !== "english") {
		meta.push(`(${language})`);
	}
	if (isOutreach && c.referralData?.outreachClaimedBy) {
		meta.push(`Claimed by ${firstName(c.referralData.outreachClaimedBy)}`);
	}
	if (c.matchedSections && c.matchedSections.length > 0) {
		meta.push(c.matchedSections.join(", "));
	}
	if (c.extraInfo) meta.push(c.extraInfo);

	return {
		hash: c.hash,
		name: c.fullName ?? c["Client Name"] ?? "",
		tab,
		color: c.color && isClientColor(c.color) ? c.color : undefined,
		chips,
		meta,
		danger: c.dangerInfo,
	};
}

/**
 * The ordered list of clients for a pinned list. Server ordering is already
 * correct for both kinds (dashboard sections are pre-sorted, getAllEnabled is
 * ordered by updatedAt/name), so this only filters and maps.
 */
export function resolvePinnedListEntries(
	pinned: PinnedList,
	args: ResolveArgs,
): PinnedListEntry[] {
	if (pinned.kind === "dashboardSection") {
		const section = args.dashboardSections?.find(
			(s) => s.title === pinned.title,
		);
		const tab = sectionTab(pinned.title);
		return (section?.clients ?? []).map((c) =>
			dashboardEntry(c, pinned.title, tab),
		);
	}

	const filters = args.insuranceFilters ?? [];
	const showMineOnly = filters.includes("mine");
	const showWaitingOnly = filters.includes("waiting");

	return (args.insuranceClients ?? [])
		.filter((c) => {
			if (showMineOnly && c.claimedUserEmail !== args.userEmail) return false;
			if (showWaitingOnly && !c.waiting) return false;
			return true;
		})
		.map((c) => ({
			hash: c.clientHash,
			name: c.clientName ?? "",
			tab: "insurance",
			waiting: c.waiting ?? false,
			chips: [],
			meta: c.claimedUserName
				? [`Claimed by ${firstName(c.claimedUserName)}`]
				: [],
		}));
}
