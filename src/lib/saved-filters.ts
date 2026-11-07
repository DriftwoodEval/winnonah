/**
 * Each user's last-used filters for the client search, client directory,
 * reports table, and scheduling table. Values are JSON strings written by
 * those components.
 */
export interface SavedFilters {
	clientFilters?: string;
	directoryFilters?: string;
	reportsFilters?: string;
	scheduling?: { active?: string; archived?: string };
}
