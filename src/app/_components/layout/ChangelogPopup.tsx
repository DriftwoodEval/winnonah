import {
	getUnseenChangelogEntries,
	renderChangelogBody,
} from "~/lib/changelog";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { ChangelogPopupDialog } from "./ChangelogPopupDialog";

export async function ChangelogPopup() {
	const session = await auth();
	if (!session) return null;

	const lastSeen = await api.users.getLastSeenChangelogDate();
	const entries = getUnseenChangelogEntries(lastSeen);
	if (entries.length === 0) return null;

	return (
		<ChangelogPopupDialog
			entries={entries.map((entry) => ({
				date: entry.date,
				title: entry.title,
				body: renderChangelogBody(entry.body),
			}))}
			latestDate={entries[0]?.date ?? ""}
		/>
	);
}
