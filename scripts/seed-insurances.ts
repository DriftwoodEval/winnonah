import { eq, sql } from "drizzle-orm";
import { db } from "../src/server/db";
import {
	evaluatorsToInsurances,
	insuranceAliases,
	insurances,
} from "../src/server/db/schema";

const initialInsurances = [
	{
		shortName: "SCM",
		aliases: ["Medicaid South Carolina"],
	},
	{
		shortName: "BabyNet",
		aliases: ["BabyNet (Combined DA and Eval)"],
	},
	{
		shortName: "Molina",
		aliases: ["Molina Healthcare of South Carolina"],
	},
	{
		shortName: "MolinaMarketplace",
		aliases: [
			"Marketplace (Molina) of South Carolina",
			"Molina Marketplace of South Carolina",
		],
	},
	{
		shortName: "ATC",
		aliases: ["Absolute Total Care - Medical", "Absolute Total Care"],
	},
	{
		shortName: "Humana",
		aliases: ["Humana Behavioral Health (formerly LifeSynch)"],
	},
	{
		shortName: "SH",
		aliases: [
			"Select Health of SC",
			"Select Health of South Carolina",
			"Select health sc",
		],
	},
	{
		shortName: "HB",
		aliases: ["Healthy Blue South Carolina"],
	},
	{
		shortName: "Aetna",
		aliases: ["Aetna Health, Inc.", "Meritain Health Aetna"],
	},
	{
		shortName: "United_Optum",
		aliases: [
			"All Savers Alternate Funding-UHC",
			"GEHA UnitedHealthcare Shared Services (UHSS)",
			"Oxford-UHC",
			"United Healthcare",
			"United Healthcare/OptumHealth / OptumHealth Behavioral Solutions",
		],
	},
	{ shortName: "Tricare", aliases: ["TriCare East"] },
];

const OLD_COLUMNS = [
	"SCM",
	"BabyNet",
	"Molina",
	"MolinaMarketplace",
	"ATC",
	"Humana",
	"SH",
	"HB",
	"Aetna",
	"United_Optum",
];

async function seed() {
	console.log("Seeding insurances...");
	const shortNameToId: Record<string, number> = {};

	for (const data of initialInsurances) {
		const { aliases, ...insurance } = data;

		try {
			await db
				.insert(insurances)
				.values({
					...insurance,
					preAuthNeeded: false,
					preAuthLockin: false,
					appointmentsRequired: 1,
				})
				.onDuplicateKeyUpdate({ set: { shortName: insurance.shortName } });
		} catch (err) {
			// If fullName still exists and is required, we might hit an error
			if (
				err instanceof Error &&
				"code" in err &&
				err.code === "ER_NO_DEFAULT_FOR_FIELD" &&
				"sqlMessage" in err &&
				typeof err.sqlMessage === "string" &&
				err.sqlMessage.includes("fullName")
			) {
				console.log(
					`Detected existing fullName column for ${insurance.shortName}, providing default...`,
				);
				await db.execute(sql`INSERT INTO emr_insurance (shortName, fullName, preAuthNeeded, preAuthLockin, appointmentsRequired)
					VALUES (${insurance.shortName}, ${insurance.shortName}, false, false, 1)
					ON DUPLICATE KEY UPDATE shortName = VALUES(shortName)`);
			} else {
				throw err;
			}
		}

		const [inserted] = await db
			.select()
			.from(insurances)
			.where(eq(insurances.shortName, insurance.shortName));

		if (inserted) {
			shortNameToId[insurance.shortName] = inserted.id;

			// Clear existing aliases and re-insert for the seed
			await db
				.delete(insuranceAliases)
				.where(eq(insuranceAliases.insuranceId, inserted.id));

			if (aliases.length > 0) {
				await db.insert(insuranceAliases).values(
					aliases.map((name) => ({
						name,
						insuranceId: inserted.id,
					})),
				);
			}
		}
	}

	console.log("Migrating evaluator insurance relationships...");
	// Fetch all evaluators using raw SQL to get the old columns
	const [allEvaluators] = await db.execute(sql`SELECT * FROM emr_evaluator`);

	if (Array.isArray(allEvaluators)) {
		for (const evaluator of allEvaluators as Record<string, unknown>[]) {
			const npi = evaluator.npi as number;
			console.log(`Processing evaluator ${npi}: ${evaluator.providerName}`);

			for (const col of OLD_COLUMNS) {
				if (evaluator[col] === 1 || evaluator[col] === true) {
					const insuranceId = shortNameToId[col];
					if (insuranceId) {
						await db
							.insert(evaluatorsToInsurances)
							.values({
								evaluatorNpi: npi,
								insuranceId: insuranceId,
							})
							.onDuplicateKeyUpdate({
								set: { evaluatorNpi: npi },
							});
					}
				}
			}
		}
	}

	console.log("Seeding and migration completed.");
}

seed()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
