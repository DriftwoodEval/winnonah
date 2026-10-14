import { and, eq, like, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

async function run() {
	console.log(
		`Cleaning up stale "No link grabbed for" failures...${DRY_RUN ? " [DRY RUN]" : ""}`,
	);

	const connection = await mysql.createConnection(env.DATABASE_URL);
	const db = drizzle(connection, { schema, mode: "default" });

	const staleFailures = await db.query.failures.findMany({
		where: like(schema.failures.reason, "No link grabbed for %"),
	});

	let resolvedCount = 0;
	let skippedCount = 0;

	for (const failure of staleFailures) {
		const questionnaireType = failure.reason.replace(
			"No link grabbed for ",
			"",
		);

		const resolvingQuestionnaire = await db.query.questionnaires.findFirst({
			where: and(
				eq(schema.questionnaires.clientId, failure.clientId),
				eq(schema.questionnaires.questionnaireType, questionnaireType),
				ne(schema.questionnaires.status, "ARCHIVED"),
			),
		});

		if (!resolvingQuestionnaire) {
			console.log(
				`Unresolved: client ${failure.clientId} - "${failure.reason}"`,
			);
			skippedCount++;
			continue;
		}

		console.log(
			`${DRY_RUN ? "[DRY RUN] " : ""}Resolving failure for client ${failure.clientId}: "${failure.reason}"`,
		);

		if (!DRY_RUN) {
			await db
				.delete(schema.failures)
				.where(
					and(
						eq(schema.failures.clientId, failure.clientId),
						eq(schema.failures.reason, failure.reason),
					),
				);
		}
		resolvedCount++;
	}

	console.log(
		`\nDone. Resolved: ${resolvedCount}, left as unresolved: ${skippedCount}`,
	);

	await connection.end();
}

run().catch((err) => {
	console.error("Cleanup failed:", err);
	process.exit(1);
});
