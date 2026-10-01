import { describe, expect, it } from "vitest";
import {
	formatQuestionnaireHistoryEntry,
	NO_DISPLAYABLE_BULK_UPDATE,
} from "./questionnaire-history";

describe("formatQuestionnaireHistoryEntry", () => {
	it("formats a new questionnaire", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.addQuestionnaire", {
				questionnaireType: "DP-4",
				sent: "2026-01-02",
				status: "PENDING",
			}),
		).toBe("Added DP-4 (sent 1/2/26)");
	});

	it("formats a reactivated questionnaire", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.addQuestionnaire", {
				questionnaireType: "DP-4",
				reactivated: true,
			}),
		).toBe("Reactivated DP-4");
	});

	it("ignores a legacy ISO-instant sent value instead of showing a shifted date", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.addQuestionnaire", {
				questionnaireType: "DP-4",
				sent: "2026-01-02T05:00:00.000Z",
			}),
		).toBe("Added DP-4");
	});

	it("formats a bulk add with both added and reactivated types", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.addBulkQuestionnaires", {
				added: ["DP-4"],
				reactivated: ["Vineland-3"],
			}),
		).toBe("added DP-4; reactivated Vineland-3");
	});

	it("falls back to a generic label for the legacy raw-text bulk-add shape", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.addBulkQuestionnaires", {
				clientId: 1,
				text: "DP-4\nhttps://example.com",
			}),
		).toBe("Bulk-imported questionnaires");
	});

	it("formats an update with the current wrapped detail shape", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.updateQuestionnaire", {
				questionnaireType: "DP-4",
				changes: { status: { from: "PENDING", to: "COMPLETED" } },
			}),
		).toBe("Updated DP-4: status Pending → Completed");
	});

	it("falls back to a generic label for the legacy unwrapped diff shape", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.updateQuestionnaire", {
				status: { from: "PENDING", to: "COMPLETED" },
			}),
		).toBe("Updated a questionnaire: status Pending → Completed");
	});

	it("drops a field diff whose formatted from/to values are identical", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.updateQuestionnaire", {
				questionnaireType: "DP-4",
				changes: { link: { from: null, to: null } },
			}),
		).toBe("Updated DP-4: no changes recorded");
	});

	it("formats a bulk status update", () => {
		expect(
			formatQuestionnaireHistoryEntry("questionnaires.bulkUpdateStatus", {
				status: "COMPLETED",
				questionnaires: [
					{ questionnaireType: "DP-4", from: "PENDING", to: "COMPLETED" },
				],
			}),
		).toBe("Set DP-4 to Completed");
	});

	it("formats an automated bulk update with per-questionnaire changes", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.bulkUpdate", {
				questionnaires: [
					{
						questionnaireType: "DP-4",
						sent: "2026-01-02",
						status: { from: "PENDING", to: "COMPLETED" },
					},
					{
						questionnaireType: "Vineland-3",
						sent: "2026-01-02",
						reminded: { from: 0, to: 1 },
					},
				],
			}),
		).toBe(
			"DP-4: status Pending → Completed; Vineland-3: reminder count 0 → 1 (automated)",
		);
	});

	it("collapses an automated bulk update where every field is a none/none artifact", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.bulkUpdate", {
				questionnaires: [
					{
						questionnaireType: "ASRS (2-5 Years)",
						status: { from: null, to: null },
						reminded: { from: null, to: null },
						lastReminded: { from: null, to: null },
					},
				],
			}),
		).toBe(NO_DISPLAYABLE_BULK_UPDATE);
	});

	it("drops only the no-op questionnaire from a mixed automated bulk update", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.bulkUpdate", {
				questionnaires: [
					{
						questionnaireType: "ASRS (2-5 Years)",
						status: { from: null, to: null },
					},
					{
						questionnaireType: "DP-4",
						reminded: { from: 0, to: 1 },
					},
				],
			}),
		).toBe("DP-4: reminder count 0 → 1 (automated)");
	});

	it("names the reminder stage and variant for a sent reminder message", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.messageSent", {
				isFailureReminder: false,
				reminderIndex: 1,
				variant: "POSTEVAL",
				usedOverride: false,
			}),
		).toBe("Sent a reminder message (2nd reminder, Post-Eval)");
	});

	it("flags a reminder message sent from a custom per-client override", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.messageSent", {
				isFailureReminder: false,
				reminderIndex: 0,
				variant: "DEFAULT",
				usedOverride: true,
			}),
		).toBe("Sent a reminder message (1st reminder, custom override)");
	});

	it("formats a reminder message with no template info as a plain sentence (legacy rows)", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.messageSent", {
				isFailureReminder: false,
			}),
		).toBe("Sent a reminder message");
	});

	it("still labels a failure reminder without template info", () => {
		expect(
			formatQuestionnaireHistoryEntry("internal.questionnaire.messageSent", {
				isFailureReminder: true,
				failureReason: "docs not signed",
			}),
		).toBe("Sent a failure reminder message");
	});

	it("formats an automated posteval sweep", () => {
		expect(
			formatQuestionnaireHistoryEntry(
				"python.questionnaire.markPostevalPending",
				{ questionnaireTypes: ["DP-4", "Vineland-3"] },
			),
		).toBe("Marked DP-4, Vineland-3 as Post-Eval, Pending (automated)");
	});

	it("falls back to the raw action name for an unknown action", () => {
		expect(formatQuestionnaireHistoryEntry("unknown.action", {})).toBe(
			"unknown.action",
		);
	});
});
