import { and, desc, eq, inArray } from "drizzle-orm";
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
	dob: Date,
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

	return Math.floor(
		(referenceDate.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
	);
}
