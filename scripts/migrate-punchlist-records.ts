import fs from "node:fs";
import path from "node:path";
import { generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import mysql from "mysql2/promise";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

async function runMigration() {
	console.log(
		`🚀 Starting Punchlist to External Records migration...${DRY_RUN ? " [DRY RUN]" : ""}`,
	);

	// 1. Setup Google Auth
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

	// 2. Setup Database
	const connection = await mysql.createConnection(env.DATABASE_URL);
	const db = drizzle(connection, { schema, mode: "default" });
	console.log("✅ Database connection established.");

	// 3. Fetch Punchlist Data
	console.log("Fetching punchlist data from Google Sheets...");
	const response = await sheets.spreadsheets.values.get({
		spreadsheetId: env.PUNCHLIST_ID,
		range: env.PUNCHLIST_RANGE,
	});

	const data = response.data.values;
	if (!data || data.length === 0) {
		console.log("No data found in spreadsheet.");
		await connection.end();
		return;
	}

	const headers = data[0];
	const rows = data.slice(1);

	const clientIdIndex = headers.indexOf("Client ID");
	const recordsNeededIndex = headers.indexOf("Records Needed");
	const recordsRequestedIndex = headers.indexOf("Records Requested?");
	const recordsReviewedIndex = headers.indexOf("Records Reviewed?");

	if (clientIdIndex === -1) {
		console.error("Could find 'Client ID' column.");
		await connection.end();
		process.exit(1);
	}

	let migratedCount = 0;
	let skippedCount = 0;
	let errorCount = 0;

	for (const row of rows) {
		const rawClientId = row[clientIdIndex];
		if (!rawClientId || rawClientId.trim() === "") continue;

		const clientId = parseInt(rawClientId, 10);
		if (Number.isNaN(clientId)) {
			console.warn(`Invalid Client ID: ${rawClientId}`);
			continue;
		}

		try {
			// Find client in DB
			const client = await db.query.clients.findFirst({
				where: eq(schema.clients.id, clientId),
			});

			if (!client) {
				console.warn(`⚠️ Client ${clientId} not found in DB. Skipping.`);
				skippedCount++;
				continue;
			}

			const logs: string[] = [];

			// Extract data from row
			const recordsNeededRaw = row[recordsNeededIndex] as string | undefined;
			const recordsRequestedRaw = row[recordsRequestedIndex] as
				| string
				| undefined;
			const recordsReviewedRaw = row[recordsReviewedIndex] as
				| string
				| undefined;

			const isBabyNet = recordsNeededRaw?.toLowerCase().includes("babynet");

			if (isBabyNet) {
				const ifspDownloaded = recordsReviewedRaw === "TRUE";
				logs.push(`BabyNet(ifsp=true, downloaded=${ifspDownloaded})`);
				if (!DRY_RUN) {
					await db
						.update(schema.clients)
						.set({
							ifsp: true,
							ifspDownloaded,
						})
						.where(eq(schema.clients.id, clientId));
				}
			} else {
				let recordsNeededValue: "Needed" | "Not Needed" | null = null;
				if (recordsNeededRaw === "TRUE") {
					recordsNeededValue = "Needed";
				} else if (recordsNeededRaw && recordsNeededRaw.trim() !== "") {
					recordsNeededValue = "Not Needed";
				}

				if (recordsNeededValue) {
					logs.push(`recordsNeeded=${recordsNeededValue}`);
					if (!DRY_RUN) {
						await db
							.update(schema.clients)
							.set({ recordsNeeded: recordsNeededValue })
							.where(eq(schema.clients.id, clientId));
					}
				}
			}

			// Prepare External Record data
			let requestedDate: Date | null = null;
			if (
				!isBabyNet &&
				recordsRequestedRaw &&
				recordsRequestedRaw.trim() !== ""
			) {
				const parsedDate = new Date(recordsRequestedRaw);
				if (!Number.isNaN(parsedDate.getTime())) {
					requestedDate = parsedDate;
				} else if (recordsRequestedRaw === "TRUE") {
					requestedDate = new Date();
				}
			}

			// Prepare content (Reviewed data)
			let contentHtml = "";
			if (recordsReviewedRaw === "TRUE") {
				contentHtml = "<p>Imported from Punchlist.</p>";
			} else if (
				recordsReviewedRaw &&
				recordsReviewedRaw.trim() !== "" &&
				recordsReviewedRaw.toUpperCase() !== "FALSE"
			) {
				contentHtml = `<p>${recordsReviewedRaw}</p>`;
			}

			const tiptapJson =
				contentHtml !== "" ? generateJSON(contentHtml, [StarterKit]) : null;

			// Upsert into externalRecords
			const existingExternalRecord = await db.query.externalRecords.findFirst({
				where: eq(schema.externalRecords.clientId, clientId),
			});

			if (existingExternalRecord) {
				// biome-ignore lint/suspicious/noExplicitAny: this script got ran once and it ran fine whatever
				const updates: any = {};
				if (requestedDate && !existingExternalRecord.requested)
					updates.requested = requestedDate;
				if (tiptapJson && !existingExternalRecord.content)
					updates.content = tiptapJson;

				if (Object.keys(updates).length > 0) {
					logs.push(`updateExtRec(${Object.keys(updates).join(",")})`);
					if (!DRY_RUN) {
						await db
							.update(schema.externalRecords)
							.set(updates)
							.where(eq(schema.externalRecords.clientId, clientId));
					}
				}
			} else if (requestedDate || tiptapJson) {
				logs.push(
					`insertExtRec(req=${!!requestedDate}, content=${contentHtml})`,
				);
				if (!DRY_RUN) {
					await db.insert(schema.externalRecords).values({
						clientId,
						requested: requestedDate,
						content: tiptapJson,
						updatedBy: "migration-script",
					});
				}
			}

			if (recordsReviewedRaw?.toLowerCase().includes("autism")) {
				logs.push("autismStop=true");
				if (!DRY_RUN) {
					await db
						.update(schema.clients)
						.set({ autismStop: true })
						.where(eq(schema.clients.id, clientId));
				}
			}

			if (logs.length > 0) {
				console.log(
					`${DRY_RUN ? "[DRY RUN] " : "✅ "}Client ${clientId.toString().padEnd(6)} | ${logs.join(" | ")}`,
				);
			}

			migratedCount++;
		} catch (error) {
			console.error(`❌ Error processing client ${clientId}:`, error);
			errorCount++;
		}
	}

	console.log(`
🎉 Migration finished!${DRY_RUN ? " [DRY RUN]" : ""}`);
	console.log(`Processed: ${migratedCount}`);
	console.log(`Skipped (not in DB): ${skippedCount}`);
	console.log(`Errors: ${errorCount}`);

	await connection.end();
}

runMigration().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
