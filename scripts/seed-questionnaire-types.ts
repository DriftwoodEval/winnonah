import { db } from "../src/server/db";
import { assessmentTypes } from "../src/server/db/schema";

const types: (typeof assessmentTypes.$inferInsert)[] = [
	{ name: "DP-4", site: "WPS", minAge: 0, maxAge: 22 },
	{ name: "BASC Preschool", site: "QGlobal", minAge: 0, maxAge: 5 },
	{ name: "BASC Child", site: "QGlobal", minAge: 6, maxAge: 11 },
	{ name: "BASC Adolescent", site: "QGlobal", minAge: 12, maxAge: 21 },
	{ name: "Conners EC", site: "MHS", minAge: 0, maxAge: 5 },
	{ name: "Conners 4", site: "MHS", minAge: 6, maxAge: 17 },
	{ name: "Conners 4 Self", site: "MHS", minAge: 8, maxAge: 17 },
	{ name: "ASRS (2-5 Years)", site: "MHS", minAge: 2, maxAge: 5 },
	{ name: "ASRS (6-18 Years)", site: "MHS", minAge: 6, maxAge: 18 },
	{ name: "Vineland", site: "QGlobal", minAge: 0, maxAge: 80 },
	{ name: "PAI", site: "MHS", minAge: 18, maxAge: 99 },
	{ name: "CAARS 2", site: "MHS", minAge: 18, maxAge: 80 },
	{ name: "SRS-2", site: "Unknown", minAge: 19, maxAge: 99 },
	{ name: "SRS Self", site: "Unknown", minAge: 19, maxAge: 99 },
	{ name: "ABAS 3", site: "Unknown", minAge: 16, maxAge: 89 },
	{ name: "CAT-Q", site: "NovoPsych", minAge: 16, maxAge: 99 },
];

async function seed() {
	console.log("Seeding questionnaire types...");

	const existing = await db.query.assessmentTypes.findMany();
	if (existing.length > 0) {
		console.log(`Skipping: ${existing.length} types already exist.`);
		return;
	}

	await db.insert(assessmentTypes).values(types);
	console.log(`Inserted ${types.length} questionnaire types.`);
}

seed()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
