import {
	getChangelogEntries,
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

	const lastSeen = parseChangelogMarker(await api.users.getChangelogMarker());
	const entries = getUnseenChangelogEntries(lastSeen);
	if (entries.length === 0) return null;

	// Mark the newest day's entry fully seen, at bullet granularity, even
	// though the popup may only be showing the bullets added since last dismissal.
	const latestFull = getChangelogEntries()[0];

	return (
		<ChangelogPopupDialog
			entries={entries.map((entry) => ({
				date: entry.date,
				body: renderChangelogBody(entry.body),
			}))}
			latestMarker={
				latestFull
					? serializeChangelogMarker({
							date: latestFull.date,
							bulletHashes: latestFull.bullets.map((bullet) => bullet.hash),
						})
					: ""
			}
		/>
	);
}
