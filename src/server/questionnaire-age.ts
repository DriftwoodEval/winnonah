import { and, desc, eq, inArray } from "drizzle-orm";
import { parseDateOnly } from "~/lib/utils";
import type { Context } from "~/server/api/trpc";
import { appointments } from "~/server/db/schema";

/**
 * Age (in years) to use when deciding which questionnaires/assessments a
 * client needs. Uses the client's age at their most recent eval appointment
 * if they have one, otherwise their current age.
 */
export async function getQuestionnaireEligibilityAge(
	db: Context["db"],
	clientId: number,
	dob: string,
): Promise<number> {
	const mostRecentEval = await db.query.appointments.findFirst({
		where: and(
			eq(appointments.clientId, clientId),
			inArray(appointments.daEval, ["EVAL", "DAEVAL"]),
			eq(appointments.billingOnly, false),
			eq(appointments.cancelled, false),
			eq(appointments.placeholder, false),
		),
		columns: { startTime: true },
		orderBy: desc(appointments.startTime),
	});

	const referenceDate = mostRecentEval?.startTime ?? new Date();
	const parsedDob = parseDateOnly(dob);
	if (!parsedDob) return 0;
	const dobAsUtcInstant = Date.UTC(
		parsedDob.year,
		parsedDob.month - 1,
		parsedDob.day,
	);

	return Math.floor(
		(referenceDate.getTime() - dobAsUtcInstant) /
			(1000 * 60 * 60 * 24 * 365.25),
	);
}
