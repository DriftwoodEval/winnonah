import type { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import { formatShortDate } from "~/lib/utils";

/** `emr_audit_log.action` values that represent a change to the `emr_questionnaire` table, from both the app and the automated writers (see `src/server/api/audit.ts`, `questionnaires/utils/database.py`, `python/utils/database.py`). */
export const QUESTIONNAIRE_HISTORY_ACTIONS = [
	"questionnaires.addQuestionnaire",
	"questionnaires.addBulkQuestionnaires",
	"questionnaires.updateQuestionnaire",
	"questionnaires.deleteQuestionnaire",
	"questionnaires.bulkUpdateStatus",
	"internal.questionnaire.create",
	"internal.questionnaire.update",
	"internal.questionnaire.bulkUpdate",
	"internal.questionnaire.messageSent",
	"python.questionnaire.markPostevalPending",
] as const;

const STATUS_LABELS: Partial<
	Record<(typeof QUESTIONNAIRE_STATUSES)[number], string>
> = {
	POSTEVAL_PENDING: "Post-Eval, Pending",
	POSTDA_PENDING: "Post-DA, Pending",
};

export function statusLabel(s: string) {
	return (
		STATUS_LABELS[s as keyof typeof STATUS_LABELS] ??
		`${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}`
	);
}

/** True only for a plain "YYYY-MM-DD" value. A `sent` field logged before an action carried its own audit detail may hold a serialized Date instant instead; formatting that as a date-only value would shift the displayed day (see CLAUDE.md's date-only column guidance), so those are better left unformatted. */
function isDateOnly(value: unknown): value is string {
	return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Returned by `formatQuestionnaireHistoryEntry` for an `internal.questionnaire.bulkUpdate` row that, after filtering display no-ops, has nothing left to show. Callers that list entries for a client should drop rows with this exact text rather than show it, since it only ever means "an automated sync ran and touched nothing visible." */
export const NO_DISPLAYABLE_BULK_UPDATE =
	"Synced, no displayable changes (automated)";

const FIELD_LABELS: Record<string, string> = {
	questionnaireType: "type",
	link: "link",
	sent: "sent date",
	status: "status",
	reminded: "reminder count",
	lastReminded: "last reminded date",
};

function formatFieldValue(field: string, value: unknown): string {
	if (value === null || value === undefined) return "none";
	if (field === "status") return statusLabel(String(value));
	if (field === "sent" || field === "lastReminded") {
		return isDateOnly(value) ? formatShortDate(value) : "none";
	}
	if (field === "link") return value ? "set" : "none";
	return String(value);
}

const REMINDER_STAGE_LABELS: Record<number, string> = {
	0: "1st reminder",
	1: "2nd reminder",
	2: "3rd reminder (final)",
};

const REMINDER_VARIANT_LABELS: Record<string, string> = {
	POSTDA: "Post-DA",
	POSTEVAL: "Post-Eval",
};

/** Describes which `emr_questionnaire_reminder_template` row (or per-client override) a reminder text used, for the "Sent a reminder message" history entry. */
function reminderTemplateDescription(detail: Record<string, unknown>): string {
	const parts: string[] = [];
	if (typeof detail.reminderIndex === "number") {
		parts.push(
			REMINDER_STAGE_LABELS[detail.reminderIndex] ??
				`Reminder ${detail.reminderIndex + 1}`,
		);
	}
	const variantLabel =
		typeof detail.variant === "string"
			? REMINDER_VARIANT_LABELS[detail.variant]
			: undefined;
	if (variantLabel) parts.push(variantLabel);
	if (detail.usedOverride) parts.push("custom override");
	return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function fieldChangeText(field: string, from: unknown, to: unknown) {
	const label = FIELD_LABELS[field] ?? field;
	return `${label} ${formatFieldValue(field, from)} → ${formatFieldValue(field, to)}`;
}

/**
 * Some writers (notably the `questionnaires` app's reminder sweep) log a
 * `{from, to}` pair for a field even when nothing displayable actually
 * changed, e.g. both sides missing from its source data. Comparing the
 * formatted values, rather than the raw ones, drops those "none → none"
 * entries without having to know why the writer produced them.
 */
function isDisplayNoOp(field: string, from: unknown, to: unknown) {
	return formatFieldValue(field, from) === formatFieldValue(field, to);
}

function changesText(changes: unknown): string {
	if (!changes || typeof changes !== "object") return "no changes recorded";
	const entries = Object.entries(changes as Record<string, unknown>).filter(
		([, v]) => v && typeof v === "object" && "from" in (v as object),
	);
	const texts = entries
		.map(([field, v]) => {
			const { from, to } = v as { from: unknown; to: unknown };
			return isDisplayNoOp(field, from, to)
				? null
				: fieldChangeText(field, from, to);
		})
		.filter((t): t is string => t !== null);
	return texts.length > 0 ? texts.join(", ") : "no changes recorded";
}

interface BulkUpdateQuestionnaireChange {
	questionnaireType: string;
	status?: { from: unknown; to: unknown };
	reminded?: { from: unknown; to: unknown };
	lastReminded?: { from: unknown; to: unknown };
}

/** Returns null when every field on this questionnaire is a display no-op, so the caller can drop it from the entry entirely instead of printing an empty-looking line. */
function formatBulkUpdateQuestionnaire(
	q: BulkUpdateQuestionnaireChange,
): string | null {
	const parts: string[] = [];
	if (q.status && !isDisplayNoOp("status", q.status.from, q.status.to)) {
		parts.push(fieldChangeText("status", q.status.from, q.status.to));
	}
	if (
		q.reminded &&
		!isDisplayNoOp("reminded", q.reminded.from, q.reminded.to)
	) {
		parts.push(fieldChangeText("reminded", q.reminded.from, q.reminded.to));
	}
	if (
		q.lastReminded &&
		!isDisplayNoOp("lastReminded", q.lastReminded.from, q.lastReminded.to)
	) {
		parts.push(
			fieldChangeText("lastReminded", q.lastReminded.from, q.lastReminded.to),
		);
	}
	if (parts.length === 0) return null;
	return `${q.questionnaireType}: ${parts.join(", ")}`;
}

/**
 * Formats an `emr_audit_log` row's `action` + `detail` into a user-facing
 * description for the per-client questionnaire history view. Handles both
 * the current detail shapes (written by `questionnaires.ts` and the
 * `questionnaires`/cron Python writers) and the older, unwrapped diff shape
 * `questionnaires.updateQuestionnaire` logged before detail was
 * restructured to carry the questionnaire's id/type, and the pre-audit-detail
 * `addQuestionnaire`/`addBulkQuestionnaires` rows that logged the raw
 * mutation input instead.
 */
export function formatQuestionnaireHistoryEntry(
	action: string,
	detail: unknown,
): string {
	const d = (detail && typeof detail === "object" ? detail : {}) as Record<
		string,
		unknown
	>;

	switch (action) {
		case "questionnaires.addQuestionnaire": {
			const type = d.questionnaireType
				? String(d.questionnaireType)
				: "a questionnaire";
			const sent = isDateOnly(d.sent)
				? ` (sent ${formatShortDate(d.sent)})`
				: "";
			return d.reactivated
				? `Reactivated ${type}${sent}`
				: `Added ${type}${sent}`;
		}
		case "questionnaires.addBulkQuestionnaires": {
			const added = Array.isArray(d.added) ? (d.added as string[]) : [];
			const reactivated = Array.isArray(d.reactivated)
				? (d.reactivated as string[])
				: [];
			const parts: string[] = [];
			if (added.length) parts.push(`added ${added.join(", ")}`);
			if (reactivated.length)
				parts.push(`reactivated ${reactivated.join(", ")}`);
			// Legacy rows logged the raw pasted text instead, with neither key.
			return parts.length ? parts.join("; ") : "Bulk-imported questionnaires";
		}
		case "questionnaires.updateQuestionnaire": {
			const type = d.questionnaireType
				? String(d.questionnaireType)
				: "a questionnaire";
			// Legacy rows store the diff directly, with no questionnaireType/changes wrapper.
			const changes = "changes" in d ? d.changes : d;
			return `Updated ${type}: ${changesText(changes)}`;
		}
		case "questionnaires.deleteQuestionnaire": {
			const type = d.questionnaireType
				? String(d.questionnaireType)
				: "a questionnaire";
			return `Archived ${type}`;
		}
		case "questionnaires.bulkUpdateStatus": {
			const qs = Array.isArray(d.questionnaires)
				? (d.questionnaires as { questionnaireType: string }[])
				: [];
			const types = qs.map((q) => q.questionnaireType).join(", ");
			const status = d.status ? statusLabel(String(d.status)) : "a status";
			return types
				? `Set ${types} to ${status}`
				: `Bulk set status to ${status}`;
		}
		case "internal.questionnaire.create": {
			const type = d.questionnaireType
				? String(d.questionnaireType)
				: "a questionnaire";
			return `Added ${type} (automated)`;
		}
		case "internal.questionnaire.update": {
			const type = d.questionnaireType
				? String(d.questionnaireType)
				: "a questionnaire";
			const status = d.status ? statusLabel(String(d.status)) : "unknown";
			return `Set ${type} to ${status} (automated)`;
		}
		case "internal.questionnaire.bulkUpdate": {
			const qs = Array.isArray(d.questionnaires)
				? (d.questionnaires as BulkUpdateQuestionnaireChange[])
				: [];
			const lines = qs
				.map(formatBulkUpdateQuestionnaire)
				.filter((line): line is string => line !== null);
			if (lines.length === 0) return NO_DISPLAYABLE_BULK_UPDATE;
			return `${lines.join("; ")} (automated)`;
		}
		case "internal.questionnaire.messageSent": {
			return d.isFailureReminder
				? "Sent a failure reminder message"
				: `Sent a reminder message${reminderTemplateDescription(d)}`;
		}
		case "python.questionnaire.markPostevalPending": {
			const types = Array.isArray(d.questionnaireTypes)
				? (d.questionnaireTypes as string[]).join(", ")
				: "";
			return types
				? `Marked ${types} as Post-Eval, Pending (automated)`
				: "Marked as Post-Eval, Pending (automated)";
		}
		default:
			return action;
	}
}
