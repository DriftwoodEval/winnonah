// A failure is resolved by adding FAILURE_RESOLVED_AT to its `reminded` count
// (the Python resolver in utils/database.py does the same), so every reader
// must skip rows at or above it. Use these instead of comparing `reminded`.
export const FAILURE_RESOLVED_AT = 100;

// A failure reminded more than this many times counts as a drop-list failure.
const DROP_LIST_AFTER_REMINDERS = 3;

type FailureReminders = { reminded: number | null };

export function isActiveFailure(failure: FailureReminders): boolean {
	return (failure.reminded ?? 0) < FAILURE_RESOLVED_AT;
}

export function isDropListFailure(failure: FailureReminders): boolean {
	return (
		isActiveFailure(failure) &&
		(failure.reminded ?? 0) > DROP_LIST_AFTER_REMINDERS
	);
}
