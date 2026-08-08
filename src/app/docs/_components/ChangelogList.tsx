import { getChangelogEntries, renderChangelogBody } from "~/lib/changelog";
import { formatChangelogDate } from "~/lib/formatChangelogDate";

export function ChangelogList() {
	const entries = getChangelogEntries();

	return (
		<div className="flex flex-col divide-y divide-border">
			{entries.map((entry) => (
				<div className="flex flex-col gap-2 p-4" key={entry.date}>
					<h3 className="scroll-mt-16 font-medium text-base" id={entry.date}>
						{formatChangelogDate(entry.date)}
					</h3>
					<div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>p:first-child]:mt-0 [&>p]:mt-4 [&>p]:mb-1 [&>ul]:my-0">
						{renderChangelogBody(entry.body)}
					</div>
				</div>
			))}
		</div>
	);
}
