import {
	getUnseenChangelogEntries,
	parseChangelogMarker,
	renderChangelogBody,
	serializeChangelogMarker,
} from "~/lib/changelog";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { ChangelogPopupDialog } from "./ChangelogPopupDialog";

export async function ChangelogPopup() {
	const session = await auth();
	if (!session) return null;

	const lastSeen = parseChangelogMarker(
		await api.users.getLastSeenChangelogDate(),
	);
	const entries = getUnseenChangelogEntries(lastSeen);
	if (entries.length === 0) return null;

	const latest = entries[0];

	return (
		<ChangelogPopupDialog
			entries={entries.map((entry) => ({
				date: entry.date,
				title: entry.title,
				body: renderChangelogBody(entry.body),
			}))}
			latestMarker={latest ? serializeChangelogMarker(latest) : ""}
		/>
	);
}
