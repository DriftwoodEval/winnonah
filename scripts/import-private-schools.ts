import * as fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "@e965/xlsx";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "~/server/db";
import { schoolDistricts } from "~/server/db/schema";

// Loads the "Private School Consolidated List" spreadsheet into the
// school_district table with isPrivate = true, so private and charter schools
// show up in the QSuite records-contact picker alongside public districts.
//
// Pass the .xlsx path as the first argument, or drop it next to this script as
// "private-schools.xlsx".
//
// IDs are assigned from a reserved range (public districts use their 7-digit
// federal NCES id). They are derived from each school's position in the
// sorted, de-duplicated name list, so re-running with the same list is
// idempotent. If the list is re-ordered or schools are renamed, ids shift and
// re-running leaves the old rows behind: clear "WHERE isPrivate = 1" first for
// a full reimport.
const PRIVATE_SCHOOL_ID_BASE = 900_000_000;

type PrivateSchoolInsert = InferInsertModel<typeof schoolDistricts>;

const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim();

async function importPrivateSchools() {
	try {
		const filePath =
			process.argv[2] ??
			path.join(
				dirname(fileURLToPath(import.meta.url)),
				"private-schools.xlsx",
			);
		console.log(`Reading Excel file from: ${filePath}...`);

		if (!fs.existsSync(filePath)) {
			throw new Error(
				`File not found at ${filePath}. Pass the path as an argument or place "private-schools.xlsx" next to this script.`,
			);
		}

		const workbook = xlsx.readFile(filePath);
		const sheetName = workbook.SheetNames[0];
		if (!sheetName) throw new Error("No worksheets found in the Excel file.");
		const worksheet = workbook.Sheets[sheetName];
		if (!worksheet) throw new Error(`Worksheet '${sheetName}' not found.`);

		// Row 1 is the header ("Org. Member:", "Name:", "Street Address:", ...).
		// Only the school name (column B) matters here; contact info is entered
		// per school in the QSuite Records Config.
		const rows = xlsx.utils.sheet_to_json<string[]>(worksheet, {
			raw: false,
			defval: "",
			header: 1,
		});

		const uniqueByName = new Map<string, string>();
		for (const row of rows.slice(1)) {
			const name = normalizeName(row[1] ?? "");
			if (!name) continue;
			const key = name.toLowerCase();
			if (!uniqueByName.has(key)) uniqueByName.set(key, name);
		}

		const names = Array.from(uniqueByName.values()).sort((a, b) =>
			a.localeCompare(b),
		);
		console.log(`Found ${names.length} unique private / charter schools.`);
		if (names.length === 0) {
			console.log("Nothing to import. Exiting.");
			return;
		}

		const toInsert: PrivateSchoolInsert[] = names.map((fullName, i) => ({
			id: PRIVATE_SCHOOL_ID_BASE + i,
			fullName,
			shortName: null,
			isPrivate: true,
		}));

		console.log("Starting database insertion...");
		for (const school of toInsert) {
			await db
				.insert(schoolDistricts)
				.values(school)
				.onDuplicateKeyUpdate({
					set: { fullName: school.fullName, isPrivate: true },
				});
		}

		console.log("✅ Private schools imported successfully!");
	} catch (error) {
		console.error("❌ Failed to import private schools:", error);
		process.exit(1);
	} finally {
		process.exit(0);
	}
}

importPrivateSchools();
