import { localDateToDateOnly } from "~/lib/utils";
import type { Context } from "~/server/api/trpc";
import type {
	clients,
	questionnaireRules,
	questionnaires,
} from "~/server/db/schema";
import { getQuestionnaireEligibilityAge } from "~/server/questionnaire-age";

/**
 * Picks the questionnaire rules that apply to a client, grouped by
 * (daeval, diagnosis). Within each group, a rule is considered applicable
 * if every questionnaire type it requires has already been sent to the
 * client and the rule's band is not older than the client's current age
 * (younger or accurate bands only, since an older band's questionnaires
 * shouldn't be treated as satisfied before the client has grown into
 * them); when several such rules in a group fully match (because their
 * questionnaire types overlap, e.g. shared across age bands), the rule
 * requiring the most types is preferred as the closest match to what was
 * actually sent. Only questionnaires sent since the client's current
 * session started (`sessionStartedAt`) count, so a prior cycle's sends
 * don't satisfy the current one. If no rule in a group fully matches yet,
 * that group falls back to filtering by the client's age at their most
 * recent eval appointment.
 */
export async function resolveApplicableRules(
	db: Context["db"],
	clientId: number,
	client: typeof clients.$inferSelect,
	allRules: (typeof questionnaireRules.$inferSelect)[],
	clientQs: (typeof questionnaires.$inferSelect)[],
) {
	const asdAdhd = client.asdAdhd;
	const wantedDiagnoses = new Set<string | null>();
	if (!asdAdhd) {
		wantedDiagnoses.add("ASD");
		wantedDiagnoses.add("ADHD");
		wantedDiagnoses.add("LD");
	} else {
		if (asdAdhd.includes("ASD")) wantedDiagnoses.add("ASD");
		if (asdAdhd.includes("ADHD")) wantedDiagnoses.add("ADHD");
		if (asdAdhd.includes("LD")) wantedDiagnoses.add("LD");
	}

	const diagnosisFiltered = allRules.filter((r) =>
		wantedDiagnoses.has(r.diagnosis),
	);

	const sessionStartedAt = client.sessionStartedAt;
	const sentTypes = new Set(
		clientQs
			.filter(
				(q) =>
					q.sent !== null &&
					q.status !== "ARCHIVED" &&
					(!sessionStartedAt ||
						(q.sent ?? "") >= (localDateToDateOnly(sessionStartedAt) ?? "")),
			)
			.map((q) => q.questionnaireType),
	);

	const groups = new Map<string, typeof diagnosisFiltered>();
	for (const rule of diagnosisFiltered) {
		const key = `${rule.daeval}|${rule.diagnosis ?? "null"}`;
		const group = groups.get(key);
		if (group) {
			group.push(rule);
		} else {
			groups.set(key, [rule]);
		}
	}

	const ageInYears = await getQuestionnaireEligibilityAge(
		db,
		clientId,
		client.dob,
	);
	const resultRules: (typeof diagnosisFiltered)[number][] = [];

	for (const groupRules of groups.values()) {
		const fullyMatched = groupRules.filter((r) => {
			const qs = r.questionnaires ?? [];
			return (
				qs.length > 0 &&
				qs.every((q) => sentTypes.has(q)) &&
				r.minAge <= ageInYears
			);
		});

		if (fullyMatched.length > 0) {
			const best = fullyMatched.reduce((a, b) =>
				(b.questionnaires?.length ?? 0) > (a.questionnaires?.length ?? 0)
					? b
					: a,
			);
			resultRules.push(best);
			continue;
		}

		for (const r of groupRules) {
			if (r.minAge <= ageInYears && r.maxAge >= ageInYears) {
				resultRules.push(r);
			}
		}
	}

	return { rules: resultRules, ageInYears };
}
