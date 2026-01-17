import * as fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InferInsertModel } from "drizzle-orm";
import xlsx from "xlsx";
import { db } from "~/server/db";
import { schoolDistricts } from "~/server/db/schema";

// For inserting districts into DB. Use XLSX from https://www.census.gov/programs-surveys/saipe/guidance-geographies/districts-counties.html

/**
 * Defines the shape of a single row as read from the Excel file.
 * We use a type alias for clarity and to avoid 'any'.
 */
type ExcelRow = {
	"District ID Number": number;
	"School District Name": string;
	"State Postal Code": string;
	// biome-ignore lint/suspicious/noExplicitAny: There will be extraneous columns
	[key: string]: any; // Allow for other columns we don't care about
};

/**
 * Defines the shape of the data we will insert into the database.
 * We use InferInsertModel to ensure it matches our Drizzle schema exactly.
 */
type SchoolDistrictInsert = InferInsertModel<typeof schoolDistricts>;

/**
 * Main function to import school districts from an Excel file into the database.
 * It handles the entire process from file reading to database insertion.
 */
async function importSchoolDistricts() {
	try {
		// Determine the file path relative to the current script location.
		const filePath = path.join(
			dirname(fileURLToPath(import.meta.url)),
			"schools.xlsx",
		);
		console.log(`Reading Excel file from: ${filePath}...`);

		// Check if the file exists before attempting to read it.
		if (!fs.existsSync(filePath)) {
			throw new Error(
				`File not found at ${filePath}. Please ensure 'schools.xlsx' is in the same directory as the script.`,
			);
		}

		// Read the Excel workbook.
		const workbook = xlsx.readFile(filePath);
		const sheetName = workbook.SheetNames[0];
		if (!sheetName) {
			throw new Error("No worksheets found in the Excel file.");
		}

		const worksheet = workbook.Sheets[sheetName];
		if (!worksheet) {
			throw new Error(`Worksheet '${sheetName}' not found in the workbook.`);
		}

		// Convert the worksheet data to a JSON array. We get a clean array of objects
		// where keys are column headers and values are cell contents.
		const headers = xlsx.utils.sheet_to_json(worksheet, {
			raw: false,
			header: 1,
			range: "A3:F3",
		})[0] as string[];

		// Now, read the data using the headers we just extracted.
		// The range starts from row 4 to skip the header row.
		const data: ExcelRow[] = xlsx.utils.sheet_to_json(worksheet, {
			raw: false,
			defval: "",
			header: headers,
		});

		console.log(`Found ${data.length} rows in the Excel file.`);
		console.log("Processing data to find unique SC districts...");

		// Filter the data to include only districts from South Carolina.
		const scDistricts = data.filter((row: ExcelRow) => {
			const statePostalCode = row["State Postal Code"]?.trim();
			return statePostalCode === "SC";
		});

		// Use a Map to store unique districts based on their ID, preventing duplicates.
		const uniqueDistricts = new Map<number, SchoolDistrictInsert>();

		scDistricts.forEach((row) => {
			const districtId = Number(row["District ID Number"]);
			const districtName = (row["School District Name"] || "").trim();

			// Ensure we have a valid ID and a non-empty name.
			if (districtName && !Number.isNaN(districtId)) {
				if (!uniqueDistricts.has(districtId)) {
					// Add the district to the map. We use a single object literal
					// to match the Drizzle schema.
					uniqueDistricts.set(districtId, {
						id: districtId,
						fullName: districtName,
						shortName: null,
					});
				}
			}
		});

		const districtsToInsert = Array.from(uniqueDistricts.values());
		console.log(`Found ${districtsToInsert.length} unique SC districts.`);

		// Check if there are districts to insert before proceeding.
		if (districtsToInsert.length === 0) {
			console.log("No unique SC districts found to import. Exiting.");
			return;
		}

		console.log("Starting database insertion...");

		// Use Drizzle's `insert` method with `onDuplicateKeyUpdate` for idempotency.
		// This prevents errors if the script is re-run and a district already exists.
		for (const district of districtsToInsert) {
			await db
				.insert(schoolDistricts)
				.values(district)
				.onDuplicateKeyUpdate({
					set: {
						fullName: district.fullName,
					},
				});
		}

		console.log("✅ School districts imported successfully!");
	} catch (error) {
		console.error("❌ Failed to import school districts:", error);
		process.exit(1); // Exit with a failure code
	} finally {
		process.exit(0); // Exit successfully
	}
}

// Execute the main function.
importSchoolDistricts();
