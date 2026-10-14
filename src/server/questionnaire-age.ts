import { and, desc, eq, inArray } from "drizzle-orm";
import { parseDateOnly } from "~/lib/utils";
import type { Context } from "~/server/api/trpc";
import { appointments } from "~/server/db/schema";

const evalAppointmentFilters = [
	inArray(appointments.daEval, ["EVAL", "DAEVAL"]),
	eq(appointments.billingOnly, false),
	eq(appointments.cancelled, false),
	eq(appointments.placeholder, false),
];

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
		where: and(eq(appointments.clientId, clientId), ...evalAppointmentFilters),
		columns: { startTime: true },
		orderBy: desc(appointments.startTime),
	});

	return ageAtReference(dob, mostRecentEval?.startTime);
}

/**
 * Batch form of the lookup in getQuestionnaireEligibilityAge: one query for
 * many clients. Maps clientId to the start time of their most recent eval
 * appointment (absent when they have none); feed the result to
 * `ageAtReference`.
 */
export async function getMostRecentEvalStartTimes(
	db: Context["db"],
	clientIds: number[],
): Promise<Map<number, Date>> {
	const rows = await db
		.select({
			clientId: appointments.clientId,
			startTime: appointments.startTime,
		})
		.from(appointments)
		.where(
			and(inArray(appointments.clientId, clientIds), ...evalAppointmentFilters),
		)
		.orderBy(desc(appointments.startTime));

	const latest = new Map<number, Date>();
	for (const row of rows) {
		if (!latest.has(row.clientId)) latest.set(row.clientId, row.startTime);
	}
	return latest;
}

/** Whole years between `dob` and `referenceDate` (now when omitted). */
export function ageAtReference(dob: string, referenceDate = new Date()) {
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
