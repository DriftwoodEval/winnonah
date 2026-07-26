import { Badge } from "@ui/badge";
import { getChangelogEntries, renderChangelogBody } from "~/lib/changelog";
import { formatChangelogDate } from "~/lib/formatChangelogDate";

export function ChangelogList() {
	const entries = getChangelogEntries();

	return (
		<div className="flex flex-col divide-y divide-border">
			{entries.map((entry) => (
				<div className="flex flex-col gap-2 p-4" key={entry.date}>
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="scroll-mt-16 font-medium text-base" id={entry.date}>
							{entry.title}
						</h3>
						<Badge className="text-muted-foreground" variant="outline">
							{formatChangelogDate(entry.date)}
						</Badge>
					</div>
					<div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>ul]:my-0">
						{renderChangelogBody(entry.body)}
					</div>
				</div>
			))}
		</div>
	);
}
