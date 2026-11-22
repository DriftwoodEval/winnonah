/**
 * Lists every tRPC query the UI calls that has no fixture yet, most-used first, with the files that
 * call it. Run: `pnpm exec tsx scripts/ui-preview/coverage.ts`
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURES } from "./fixtures";

const QUERY_CALL =
	/\bapi\.([A-Za-z]+\.[A-Za-z]+)\.(?:useQuery|useSuspenseQuery|useInfiniteQuery)\b/g;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return /\.tsx?$/.test(entry.name) ? [full] : [];
	});
}

const callers = new Map<string, Set<string>>();
for (const file of sourceFiles("src")) {
	for (const [, procedure] of readFileSync(file, "utf8").matchAll(QUERY_CALL)) {
		if (!procedure) continue;
		callers.set(procedure, (callers.get(procedure) ?? new Set()).add(file));
	}
}

const missing = [...callers]
	.filter(([procedure]) => !(procedure in FIXTURES))
	.sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

console.log(
	`${callers.size - missing.length}/${callers.size} queries have fixtures`,
);
for (const [procedure, files] of missing) {
	const names = [...files].map((f) => path.basename(f)).join(", ");
	console.log(`${procedure} (${files.size}): ${names}`);
}
