"use client";

import Link from "next/link";
import type { RunSummary } from "~/lib/run-summary";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

const RUN_LABELS: Record<string, string> = {
	import_from_ta: "TherapyAppointment Import",
	questionnaire_send: "Questionnaire Send",
	records_request: "Records Request",
	evaluator_rematch: "Evaluator Matching",
	appointment_sync: "Appointment Sync",
};

type CountField = Exclude<keyof RunSummary, "errors">;

const COUNT_FIELDS: { key: CountField; label: string }[] = [
	{ key: "sent", label: "Sent" },
	{ key: "requested", label: "Requested" },
	{ key: "new_clients", label: "New clients" },
	{ key: "address_changes", label: "Addresses changed" },
	{ key: "insurance_changes", label: "Insurance changed" },
	{ key: "deactivated", label: "Deactivated" },
	{ key: "reactivated", label: "Reactivated" },
	{ key: "evaluator_matches_changed", label: "Evaluator matches changed" },
	{ key: "appointments_synced", label: "Appointments synced" },
	{ key: "real_synced", label: "Real appointments" },
	{ key: "billing_only_synced", label: "Billing-only" },
	{ key: "cancelled_synced", label: "Cancelled" },
	{ key: "moved_synced", label: "Moved" },
];

export default function RunSummaryList() {
	const { data, isLoading } = api.tasks.getRunSummaries.useQuery();

	if (isLoading) return null;

	return (
		<div className="flex flex-col gap-4">
			{data?.map(({ type, task }) => (
				<div className="flex flex-col gap-1" key={type}>
					<div className="flex items-baseline justify-between gap-2">
						<span className="font-medium text-sm">
							{RUN_LABELS[type] ?? type}
						</span>
						<span className="text-muted-foreground text-xs">
							{task
								? formatInBusinessTime(
										task.completedAt ?? task.startedAt,
										"MM/dd/yy h:mm a",
									)
								: "No runs yet"}
						</span>
					</div>
					{task?.status === "failed" && (
						<span className="text-error text-xs">
							Run failed{task.error ? `: ${task.error}` : ""}
						</span>
					)}
					{task?.summary && (
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
							{COUNT_FIELDS.filter(
								({ key }) => task.summary?.[key] !== undefined,
							).map(({ key, label }) => (
								<span key={key}>
									{label}: <strong>{task.summary?.[key]}</strong>
								</span>
							))}
							{task.summary.errors &&
								Object.entries(task.summary.errors).map(([reason, entry]) => {
									// Older rows recorded before per-client links existed have
									// a plain number here instead of a { count, clients } entry.
									const { count, clients } =
										typeof entry === "number"
											? { count: entry, clients: undefined }
											: entry;
									return (
										<span className="text-warning" key={reason}>
											{reason}: <strong>{count}</strong>
											{clients && clients.length > 0 && (
												<>
													{" ("}
													{clients.map((client, i) => (
														<span key={client.hash}>
															{i > 0 && ", "}
															<Link
																className="underline hover:no-underline"
																href={`/clients/${client.hash}`}
															>
																{client.name}
															</Link>
														</span>
													))}
													{")"}
												</>
											)}
										</span>
									);
								})}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
