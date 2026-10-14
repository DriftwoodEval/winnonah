import * as fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InferInsertModel } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "~/server/db";
import { schoolDistricts } from "~/server/db/schema";

// lazy: this still loads the "Private School Consolidated List" spreadsheet,
// which is actual private schools, not charter schools. It sets isCharter =
// true on every row so those names show up in the QSuite records-contact
// picker, but that's wrong for a charter-only seed. Don't run this against
// that list; replace it with a real charter-school list first, or drop this
// script if charter schools will be entered by hand instead.
//
// Pass the .xlsx path as the first argument, or drop it next to this script as
// "private-schools.xlsx".
//
// IDs are assigned from a reserved range (public districts use their 7-digit
// federal NCES id). They are derived from each school's position in the
// sorted, de-duplicated name list, so re-running with the same list is
// idempotent. If the list is re-ordered or schools are renamed, ids shift and
// re-running leaves the old rows behind: clear "WHERE isCharter = 1" first
// for a full reimport.
const CHARTER_SCHOOL_ID_BASE = 900_000_000;

type CharterSchoolInsert = InferInsertModel<typeof schoolDistricts>;

const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim();

async function importCharterSchools() {
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

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(filePath);
		const worksheet = workbook.worksheets[0];
		if (!worksheet) throw new Error("No worksheets found in the Excel file.");

		// Row 1 is the header ("Org. Member:", "Name:", "Street Address:", ...).
		// Only the school name (column B) matters here; contact info is entered
		// per school in the QSuite Records Config.
		const uniqueByName = new Map<string, string>();
		worksheet.eachRow((row, rowNumber) => {
			if (rowNumber === 1) return;
			const name = normalizeName(row.getCell(2).text);
			if (!name) return;
			const key = name.toLowerCase();
			if (!uniqueByName.has(key)) uniqueByName.set(key, name);
		});

		const names = Array.from(uniqueByName.values()).sort((a, b) =>
			a.localeCompare(b),
		);
		console.log(`Found ${names.length} unique private / charter schools.`);
		if (names.length === 0) {
			console.log("Nothing to import. Exiting.");
			return;
		}

		const toInsert: CharterSchoolInsert[] = names.map((fullName, i) => ({
			id: CHARTER_SCHOOL_ID_BASE + i,
			fullName,
			shortName: null,
			isCharter: true,
		}));

		console.log("Starting database insertion...");
		for (const school of toInsert) {
			await db
				.insert(schoolDistricts)
				.values(school)
				.onDuplicateKeyUpdate({
					set: { fullName: school.fullName, isCharter: true },
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

importCharterSchools();
