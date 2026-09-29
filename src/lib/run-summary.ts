export type RunSummaryErrorClient = {
	hash: string;
	name: string;
};

/**
 * One error reason's tally. `clients` links to the specific clients that
 * reason applied to, when the writer had client identities in scope; it's
 * omitted for run-level errors with no client (e.g. a missing NPI mapping).
 * Older rows written before this field existed have `errors[reason]` as a
 * plain number instead of this shape; callers should handle both.
 */
export type RunSummaryError = {
	count: number;
	clients?: RunSummaryErrorClient[];
};

/**
 * Shape of `emr_task.summary`, written by the Python cron scripts (winnonah's
 * `track_task`/`TaskHandle.set_summary` and the questionnaires repo's copy)
 * to record domain-specific counts for a run. Every field is optional since
 * each task type only fills in what applies to it.
 */
export type RunSummary = {
	sent?: number;
	requested?: number;
	failed?: number;
	new_clients?: number;
	address_changes?: number;
	insurance_changes?: number;
	deactivated?: number;
	reactivated?: number;
	evaluator_matches_changed?: number;
	appointments_synced?: number;
	real_synced?: number;
	billing_only_synced?: number;
	cancelled_synced?: number;
	moved_synced?: number;
	errors?: Record<string, RunSummaryError | number>;
};
