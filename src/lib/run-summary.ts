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
	errors?: Record<string, number>;
};
