import fs from "node:fs";
import path from "node:path";

const CHANGELOG_PATH = path.join(
	process.cwd(),
	"src/content/docs/changelog/index.mdx",
);

const ENTRY_HEADING = /^## (.+)$/gm;
const ENTRY_TITLE = /^(\d{4}-\d{2}-\d{2})\s*-\s*(.+)$/;
const GROUP_LABEL = /^\*\*(.+)\*\*$/gm;
const GROUP_ORDER = ["New", "Improved", "Fixed"];

const content = fs.readFileSync(CHANGELOG_PATH, "utf-8");
const headings = [...content.matchAll(ENTRY_HEADING)];
const errors: string[] = [];

if (headings.length === 0) {
	errors.push("no '## ' entries found");
}

let previousDate: string | null = null;

for (let i = 0; i < headings.length; i++) {
	const heading = headings[i];
	if (!heading?.[1] || heading.index === undefined) continue;

	const lineNumber = content.slice(0, heading.index).split("\n").length;
	const match = ENTRY_TITLE.exec(heading[1]);

	if (!match?.[1] || !match[2]) {
		errors.push(
			`line ${lineNumber}: heading "## ${heading[1]}" doesn't match "## YYYY-MM-DD - Title"`,
		);
		continue;
	}

	const date = match[1];

	if (previousDate && date >= previousDate) {
		errors.push(
			`line ${lineNumber}: entry "${date}" must be older than the previous entry "${previousDate}" (entries must be newest first)`,
		);
	}
	previousDate = date;

	const start = heading.index + heading[0].length;
	const end = headings[i + 1]?.index ?? content.length;
	const body = content.slice(start, end);

	const seen = new Set<string>();
	let lastOrderIndex = -1;

	for (const labelMatch of body.matchAll(GROUP_LABEL)) {
		const label = labelMatch[1];
		if (!label) continue;

		const orderIndex = GROUP_ORDER.indexOf(label);
		if (orderIndex === -1) {
			errors.push(
				`line ${lineNumber} ("${date}"): unknown group "**${label}**", expected one of ${GROUP_ORDER.join(", ")}`,
			);
			continue;
		}

		if (seen.has(label)) {
			errors.push(
				`line ${lineNumber} ("${date}"): duplicate "**${label}**" group`,
			);
			continue;
		}
		seen.add(label);

		if (orderIndex < lastOrderIndex) {
			errors.push(
				`line ${lineNumber} ("${date}"): "**${label}**" is out of order, groups must appear as ${GROUP_ORDER.join(", ")}`,
			);
		}
		lastOrderIndex = orderIndex;
	}
}

if (errors.length > 0) {
	console.error(`Changelog validation failed (${errors.length} issue(s)):`);
	for (const error of errors) console.error(`  - ${error}`);
	process.exit(1);
}

console.log(`Changelog OK: ${headings.length} entries validated.`);
