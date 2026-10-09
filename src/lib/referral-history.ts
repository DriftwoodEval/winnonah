/** `emr_audit_log.action` values that can carry a change to the referral tab's fields. `clients.update` also covers unrelated fields (color, schoolDistrict, pause, ...), so `formatReferralHistoryEntry` only looks at the referral-relevant keys of its diff. */
export const REFERRAL_HISTORY_ACTIONS = [
	"clients.update",
	"clients.claimOutreach",
	"clients.logOutreachAttempt",
] as const;

/** Human-readable labels for referral fields, shared between the referral tab's post-push edit badges and the referral history view. */
export const REFERRAL_FIELD_LABELS: Record<string, string> = {
	notes: "Notes",
	asdAdhd: "This is for",
	language: "Language",
	schoolExplanation: "Which school?",
	charterSchool: "Charter School?",
	charterSchoolConfirmed: "Charter School Confirmed",
	evaluatedByAgency: "Evaluated by School District/MUSC/Prisma/OIDD?",
	evaluatedByAgencyNotes: "Evaluation Notes",
	otherNotes: "Other Notes",
	locationPreference: "Preference",
	needsReachOut: "Outreach Status",
	reachOutCompleted: "Outreach Completed",
	followedByBabyNet: "BabyNet",
	walking: "Walking",
};

/** `referralData` keys that are bookkeeping for other features (post-push edit log, outreach attempts/claim) rather than a field a user fills out, so a raw diff of them is either redundant with another history entry or not displayable. */
const NON_DISPLAYABLE_REFERRAL_KEYS = new Set([
	"postPunchEdits",
	"outreachAttempts",
	"privatePayOutreachAttempts",
	"outreachClaimedBy",
]);

const NEEDS_REACH_OUT_LABELS: Record<string, string> = {
	reach_out: "Needs Outreach",
	review: "Review",
};

function formatFieldValue(field: string, value: unknown): string {
	if (value === null || value === undefined || value === "") return "none";
	if (field === "needsReachOut") {
		return NEEDS_REACH_OUT_LABELS[String(value)] ?? String(value);
	}
	if (typeof value === "boolean") return value ? "yes" : "no";
	return String(value);
}

function isDiffPair(value: unknown): value is { from: unknown; to: unknown } {
	return (
		!!value &&
		typeof value === "object" &&
		"from" in (value as object) &&
		"to" in (value as object)
	);
}

function fieldChangeText(
	field: string,
	from: unknown,
	to: unknown,
): string | null {
	const fromText = formatFieldValue(field, from);
	const toText = formatFieldValue(field, to);
	if (fromText === toText) return null;
	const label = REFERRAL_FIELD_LABELS[field] ?? field;
	return `${label}: ${fromText} → ${toText}`;
}

function referralDataChangesText(referralData: unknown): string[] {
	if (!referralData || typeof referralData !== "object") return [];
	return Object.entries(referralData as Record<string, unknown>)
		.filter(([field]) => !NON_DISPLAYABLE_REFERRAL_KEYS.has(field))
		.map(([field, diff]) =>
			isDiffPair(diff) ? fieldChangeText(field, diff.from, diff.to) : null,
		)
		.filter((text): text is string => text !== null);
}

/** Returned by `formatReferralHistoryEntry` for a `clients.update` row whose diff touches no referral field (it's a generic update mutation shared with the rest of the client record), so the caller can drop the row entirely. */
export const NOT_A_REFERRAL_CHANGE = "__not_a_referral_change__";

/** Formats an `emr_audit_log` row's `action` + `detail` into a user-facing description for the per-client referral history view. */
export function formatReferralHistoryEntry(
	action: string,
	detail: unknown,
): string {
	const d = (detail && typeof detail === "object" ? detail : {}) as Record<
		string,
		unknown
	>;

	switch (action) {
		case "clients.update": {
			const texts = [
				...referralDataChangesText(d.referralData),
				...(isDiffPair(d.asdAdhd)
					? [fieldChangeText("asdAdhd", d.asdAdhd.from, d.asdAdhd.to)]
					: []),
				...(isDiffPair(d.language)
					? [fieldChangeText("language", d.language.from, d.language.to)]
					: []),
			].filter((t): t is string => t !== null);
			return texts.length > 0 ? texts.join(", ") : NOT_A_REFERRAL_CHANGE;
		}
		case "clients.claimOutreach":
			if (typeof d.claiming === "boolean") {
				return d.claiming ? "Claimed outreach" : "Released outreach claim";
			}
			return "Updated outreach claim";
		case "clients.logOutreachAttempt": {
			const notes =
				typeof d.notes === "string" && d.notes ? d.notes : undefined;
			return notes
				? `Logged outreach attempt: ${notes}`
				: "Logged outreach attempt";
		}
		default:
			return NOT_A_REFERRAL_CHANGE;
	}
}
