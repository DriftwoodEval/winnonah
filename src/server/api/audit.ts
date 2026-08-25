import { eq } from "drizzle-orm";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import {
	appointments,
	auditLogs,
	faxCategorizationClientLinks,
	inPersonAssessments,
	questionnaires,
} from "~/server/db/schema";

type Db = typeof db;

async function resolveViaAppointment(db: Db, appointmentId: unknown) {
	if (typeof appointmentId !== "string") return null;
	const appt = await db.query.appointments.findFirst({
		where: eq(appointments.id, appointmentId),
		columns: { clientId: true },
	});
	return appt?.clientId ?? null;
}

async function resolveViaQuestionnaire(db: Db, id: unknown) {
	if (typeof id !== "number") return null;
	const row = await db.query.questionnaires.findFirst({
		where: eq(questionnaires.id, id),
		columns: { clientId: true },
	});
	return row?.clientId ?? null;
}

async function resolveViaInPersonAssessment(db: Db, id: unknown) {
	if (typeof id !== "number") return null;
	const row = await db.query.inPersonAssessments.findFirst({
		where: eq(inPersonAssessments.id, id),
		columns: { clientId: true },
	});
	return row?.clientId ?? null;
}

async function resolveViaFaxLink(db: Db, linkId: unknown) {
	if (typeof linkId !== "number") return null;
	const row = await db.query.faxCategorizationClientLinks.findFirst({
		where: eq(faxCategorizationClientLinks.id, linkId),
		columns: { clientId: true },
	});
	return row?.clientId ?? null;
}

/**
 * A few mutations key off a related row's id rather than the client
 * directly (an appointment, a questionnaire, an in-person assessment, a fax
 * link, ...). The related table always carries its own `clientId` column,
 * so these resolvers look it up. Keyed by tRPC path since the same field
 * name (`id`) means a different table depending on the action.
 */
const RELATED_ID_RESOLVERS: Record<
	string,
	{ field: string; resolve: (db: Db, value: unknown) => Promise<number | null> }
> = {
	"appointments.updateStatus": { field: "id", resolve: resolveViaAppointment },
	"appointments.arrive": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"appointments.start": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"appointments.depart": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"appointments.undoLastCheckinStep": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.saveNote": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.setLastTaskCompletedDate": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.setDueDateOverride": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.markReportComplete": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.unmarkReportComplete": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.setShowAnyway": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.archiveRow": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"evaluatorDashboard.unarchiveRow": {
		field: "appointmentId",
		resolve: resolveViaAppointment,
	},
	"questionnaires.updateQuestionnaire": {
		field: "id",
		resolve: resolveViaQuestionnaire,
	},
	"questionnaires.deleteQuestionnaire": {
		field: "id",
		resolve: resolveViaQuestionnaire,
	},
	"questionnaires.updateInPersonAssessmentStatus": {
		field: "id",
		resolve: resolveViaInPersonAssessment,
	},
	"questionnaires.deleteInPersonAssessment": {
		field: "id",
		resolve: resolveViaInPersonAssessment,
	},
	"faxCategorization.rejectLink": {
		field: "linkId",
		resolve: resolveViaFaxLink,
	},
};

/**
 * Most mutation inputs carry the client they act on as a top-level `clientId`
 * field, since that's the convention used across the routers. A few
 * mutations that act on two clients at once (linking/merging) use
 * `clientIdA`/`idA` instead; a couple that take the id as the entire input
 * (no wrapping object) pass it as a bare number. A handful key off a related
 * row instead (see `RELATED_ID_RESOLVERS`) and need a lookup. Falls back to
 * null (not every action is client-specific, e.g. role or settings changes,
 * or a bulk action touching many clients at once).
 */
export async function extractClientId(
	db: Db,
	path: string,
	rawInput: unknown,
): Promise<number | null> {
	if (typeof rawInput === "number") return rawInput;

	if (typeof rawInput === "object" && rawInput !== null) {
		const obj = rawInput as Record<string, unknown>;
		for (const key of ["clientId", "clientIdA", "idA"]) {
			const value = obj[key];
			if (typeof value === "number") return value;
		}

		const resolver = RELATED_ID_RESOLVERS[path];
		if (resolver) return resolver.resolve(db, obj[resolver.field]);
	}

	return null;
}

/**
 * Records the mutation's submitted input verbatim, including values, since
 * an audit trail that only names which fields changed can't show what
 * actually happened. Access to the log is restricted to the
 * settings:audit-log:view permission, so this relies on that gate rather
 * than on omitting the data.
 */
export function serializeAuditInput(rawInput: unknown) {
	if (rawInput === undefined) return null;
	return rawInput;
}

/**
 * Sentinel userId/userEmail for audit rows generated by server-to-server
 * calls (the `questionnaires` app hitting the internal API) rather than a
 * signed-in user, so they still show up in the same Settings > Audit Log
 * view instead of only in each service's own log files.
 */
export const INTERNAL_API_ACTOR = {
	userId: "system:internal-api",
	userEmail: "questionnaires (internal API)",
};

export async function recordInternalApiAudit(entry: {
	action: string;
	clientId: number | null;
	success: boolean;
	errorMessage?: string;
	ip: string;
}) {
	try {
		await db.insert(auditLogs).values({
			userId: INTERNAL_API_ACTOR.userId,
			userEmail: INTERNAL_API_ACTOR.userEmail,
			action: entry.action,
			clientId: entry.clientId,
			detail: { ip: entry.ip },
			success: entry.success,
			errorMessage: entry.errorMessage ?? null,
		});
	} catch (err) {
		logger.error({ err }, "Failed to write internal API audit log");
	}
}
