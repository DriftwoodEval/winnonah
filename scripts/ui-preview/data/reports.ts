import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import { FAKE_EVALUATORS } from "./practice";

const STATUSES = [
	"pending",
	"queued",
	"claimed",
	"submitted",
	"approved",
] as const;
const ASD_ADHD = [
	"ASD",
	"ADHD",
	"ASD+ADHD",
	"ASD+LD",
	"ADHD+LD",
	"LD",
] as const;
const WRITERS = [
	"Preview User",
	"Jordan Reyes",
	"Sam Whitfield",
	null,
] as const;
const NOW = new Date("2026-11-21T15:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

/** Rows for the first 30 real clients, cycling status, writer, review flags and archive state. */
const rows = FAKE_CLIENTS.filter((c) => !isNotesOnlyClient(c))
	.slice(0, 30)
	.map((client, i) => {
		const status = STATUSES[i % STATUSES.length] as (typeof STATUSES)[number];
		const writerName =
			status === "pending" || status === "queued"
				? null
				: (WRITERS[i % WRITERS.length] ?? null);
		const evaluator = FAKE_EVALUATORS[i % FAKE_EVALUATORS.length];
		const started = status !== "pending" && status !== "queued";
		const done = status === "submitted" || status === "approved";
		return {
			id: i + 1,
			clientId: client.id,
			clientFullName: client.fullName,
			clientHash: client.hash,
			clientDriveId: client.driveId,
			clientActive: client.status,
			clientAutismStop: client.autismStop,
			clientPause: client.pause,
			clientOutstandingBalance: client.outstandingBalance,
			clientColor: client.color,
			asdAdhd: ASD_ADHD[i % ASD_ADHD.length] ?? null,
			selfWritten: i % 4 === 3,
			billablePiecework: i % 7 !== 0,
			status,
			writerUserId: writerName ? `writer-${i % WRITERS.length}` : null,
			writerEmail: writerName ? "writer@example.com" : null,
			writerName,
			evaluatorName: evaluator?.providerName ?? null,
			folderId: `folder-${client.id}`,
			folderName: `${client.lastName}, ${client.firstName}`,
			evalAppointmentAt: i % 9 === 8 ? null : daysAgo(5 + i * 3),
			evalEvaluatorName: evaluator?.providerName ?? null,
			notes: i % 5 === 0 ? "Waiting on school records." : null,
			claimedAt: started ? daysAgo(3 + i) : null,
			writerCompletedAt: done ? daysAgo(1 + (i % 4)) : null,
			approvedAt: status === "approved" ? daysAgo(1) : null,
			paidDate: null,
			billed: status === "approved" && i % 2 === 0,
			firstReviewDone: done,
			secondReviewNeeded: i % 3 === 0,
			secondReviewDone: status === "approved" && i % 3 === 0,
			source: "auto" as const,
			archivedAt: i >= 24 ? daysAgo(10) : null,
			createdAt: daysAgo(10 + i * 3),
			isMine: writerName === "Preview User",
		};
	});

/** Mirrors `reports.list`: the active or archived tab, optionally narrowed by report kind. */
export function reportsList(raw: unknown) {
	const input = (raw ?? {}) as { tab?: "active" | "archived"; kind?: string };
	const archived = input.tab === "archived";
	return rows.filter(
		(r) =>
			(r.archivedAt !== null) === archived &&
			(input.kind !== "pool" || !r.selfWritten) &&
			(input.kind !== "self" || r.selfWritten),
	);
}
