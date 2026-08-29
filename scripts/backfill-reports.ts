import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import mysql from "mysql2/promise";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

const ADHD_ONLY_TYPES = new Set(["ADHD", "ADHD+LD"]);

type ReportStatus = (typeof schema.REPORT_STATUSES)[number];

async function run() {
	console.log(
		`Backfilling emr_report from the punch list...${DRY_RUN ? " [DRY RUN]" : ""}`,
	);

	const tokenPath = path.resolve("python/auth_cache/token.json");
	const credentialsPath = path.resolve("python/auth_cache/credentials.json");
	if (!fs.existsSync(tokenPath) || !fs.existsSync(credentialsPath)) {
		console.error("Credentials or token not found in python/auth_cache");
		process.exit(1);
	}
	const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
	const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
	const oauth2Client = new OAuth2Client({
		clientId: credentials.installed.client_id,
		clientSecret: credentials.installed.client_secret,
	});
	oauth2Client.setCredentials(token);
	const sheets = google.sheets({ version: "v4", auth: oauth2Client });

	const connection = await mysql.createConnection(env.DATABASE_URL);
	const db = drizzle(connection, { schema, mode: "default" });

	// ADHD-piecework evaluator NPI, snapshotted onto billablePiecework.
	let adhdNpi: number | null = null;
	const pyConfig = await db.query.pythonConfig.findFirst({
		where: eq(schema.pythonConfig.id, 1),
	});
	const raw = (
		pyConfig?.data as {
			config?: { piecework?: { adhd_piecework_evaluator_npi?: string } };
		}
	)?.config?.piecework?.adhd_piecework_evaluator_npi;
	if (raw && !Number.isNaN(Number(raw))) adhdNpi = Number(raw);

	const response = await sheets.spreadsheets.values.get({
		spreadsheetId: env.PUNCHLIST_ID,
		range: env.PUNCHLIST_RANGE,
	});
	const data = response.data.values ?? [];
	const headers = data[0] ?? [];
	const rows = data.slice(1);

	const col = (name: string) => headers.indexOf(name);
	const idCol = col("Client ID");
	const assignedCol = col("Assigned to OR added to report writing folder");
	const billedCol = col("Billed?");
	const ajpCol = col("AJP Review Done/Hold for payroll");
	const mcsCol = col("MCS Review Needed");
	const bridgesCol = col("BRIDGES billed?");

	const isTrue = (v: string | undefined) =>
		(v ?? "").trim().toUpperCase() === "TRUE";

	// All users with a claimed folder, for status + folder linking.
	const allUsers = await db.query.users.findMany({
		columns: { id: true, email: true, claimedReportFolder: true },
	});
	const folderToUser = new Map<
		string,
		{ userId: string; email: string; name: string }
	>();
	for (const u of allUsers) {
		for (const f of u.claimedReportFolder ?? []) {
			const m = /\[([A-Za-z0-9-]+)\]/.exec(f.name);
			if (m?.[1]) {
				folderToUser.set(m[1], {
					userId: u.id,
					email: u.email,
					name: f.name,
				});
			}
		}
	}

	let created = 0;
	let skipped = 0;

	for (const row of rows) {
		const rawId = row[idCol]?.trim();
		if (!rawId) continue;
		const clientId = Number.parseInt(rawId.replace(/\D/g, ""), 10);
		if (Number.isNaN(clientId)) continue;

		const billed = isTrue(row[billedCol]);
		const assigned = (row[assignedCol] ?? "").trim();
		const claimed = folderToUser.get(String(clientId));

		// An "open report" heuristic: someone is assigned/claimed, or it is not
		// yet billed but the client has an eval appointment.
		const client = await db.query.clients.findFirst({
			where: eq(schema.clients.id, clientId),
			columns: { id: true },
		});
		if (!client) {
			skipped++;
			continue;
		}

		const existing = await db.query.reports.findFirst({
			where: and(
				eq(schema.reports.clientId, clientId),
				isNull(schema.reports.archivedAt),
			),
			columns: { id: true },
		});
		if (existing) {
			skipped++;
			continue;
		}

		const recentEval = await db.query.appointments.findFirst({
			where: and(
				eq(schema.appointments.clientId, clientId),
				eq(schema.appointments.billingOnly, false),
				eq(schema.appointments.cancelled, false),
				eq(schema.appointments.placeholder, false),
			),
			columns: { evaluatorNpi: true, asdAdhd: true },
			orderBy: desc(schema.appointments.startTime),
		});

		if (!assigned && !claimed && billed) {
			// Already billed and nobody to track: nothing actionable to backfill.
			skipped++;
			continue;
		}

		let selfWritten = false;
		if (recentEval?.evaluatorNpi != null) {
			const ev = await db.query.evaluators.findFirst({
				where: eq(schema.evaluators.npi, recentEval.evaluatorNpi),
				columns: { writesOwnReports: true },
			});
			selfWritten = ev?.writesOwnReports ?? false;
		}

		const asdAdhd = recentEval?.asdAdhd ?? null;
		const billablePiecework =
			!asdAdhd ||
			!ADHD_ONLY_TYPES.has(asdAdhd) ||
			(adhdNpi != null && recentEval?.evaluatorNpi === adhdNpi);

		const status: ReportStatus = claimed
			? "claimed"
			: billed
				? "approved"
				: selfWritten
					? "writing"
					: "queued";

		console.log(
			`${DRY_RUN ? "[DRY RUN] " : ""}client ${String(clientId).padEnd(6)} | ${status} | self=${selfWritten} | billed=${billed} | writer=${claimed?.email ?? "-"}`,
		);

		if (!DRY_RUN) {
			await db.insert(schema.reports).values({
				clientId,
				evaluatorNpi: recentEval?.evaluatorNpi ?? null,
				asdAdhd,
				selfWritten,
				billablePiecework,
				status,
				writerUserId: claimed?.userId ?? null,
				writerEmail: claimed?.email ?? null,
				folderName: claimed?.name ?? null,
				billed,
				ajpReviewDone: isTrue(row[ajpCol]),
				mcsReviewNeeded: isTrue(row[mcsCol]),
				bridgesBilled: isTrue(row[bridgesCol]),
				source: "backfill",
				createdByEmail: "backfill-script",
			});
		}
		created++;
	}

	console.log(
		`\nDone.${DRY_RUN ? " [DRY RUN]" : ""} Created: ${created}, Skipped: ${skipped}`,
	);
	await connection.end();
}

run().catch((err) => {
	console.error("Backfill failed:", err);
	process.exit(1);
});
