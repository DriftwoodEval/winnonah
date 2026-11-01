import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import { auditLogs } from "~/server/db/schema";

/**
 * Records a sign-in, sign-out, or impersonation event in the audit log.
 * `userId` and `userEmail` are the person who did it. Failures here must not
 * block authentication, so they are swallowed after logging.
 */
export async function recordAuthAudit(entry: {
	userId: string;
	userEmail: string;
	action:
		| "auth.sign_in"
		| "auth.sign_in_blocked"
		| "auth.sign_out"
		| "impersonation.started"
		| "impersonation.stopped";
	impersonatedBy?: string | null;
	detail?: Record<string, unknown>;
	success?: boolean;
	errorMessage?: string;
}) {
	try {
		await db.insert(auditLogs).values({
			userId: entry.userId,
			userEmail: entry.userEmail,
			impersonatedBy: entry.impersonatedBy ?? null,
			action: entry.action,
			detail: entry.detail ?? null,
			success: entry.success ?? true,
			errorMessage: entry.errorMessage ?? null,
		});
	} catch (error) {
		logger.error({ err: error }, "Could not write an auth audit entry");
	}
}
