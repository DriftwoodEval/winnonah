export function formatChangelogDate(date: string): string {
	return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}
