import { db } from "../src/server/db";
import { questionnaireRules } from "../src/server/db/schema";

const rules: (typeof questionnaireRules.$inferInsert)[] = [
	// DA + ASD
	{
		daeval: "DA",
		diagnosis: "ASD",
		minAge: 2,
		maxAge: 5,
		questionnaires: ["ASRS (2-5 Years)"],
	},
	{
		daeval: "DA",
		diagnosis: "ASD",
		minAge: 6,
		maxAge: 18,
		questionnaires: ["ASRS (6-18 Years)"],
	},
	{
		daeval: "DA",
		diagnosis: "ASD",
		minAge: 19,
		maxAge: 150,
		questionnaires: ["SRS Self"],
	},

	// DA + ADHD
	{
		daeval: "DA",
		diagnosis: "ADHD",
		minAge: 4,
		maxAge: 5,
		questionnaires: ["Conners EC"],
	},
	{
		daeval: "DA",
		diagnosis: "ADHD",
		minAge: 6,
		maxAge: 11,
		questionnaires: ["Conners 4"],
	},
	{
		daeval: "DA",
		diagnosis: "ADHD",
		minAge: 12,
		maxAge: 17,
		questionnaires: ["Conners 4", "Conners 4 Self"],
	},
	{
		daeval: "DA",
		diagnosis: "ADHD",
		minAge: 18,
		maxAge: 150,
		questionnaires: ["CAARS 2"],
	},

	// EVAL + ASD
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 2,
		maxAge: 5,
		questionnaires: ["Conners EC", "DP-4", "BASC Preschool", "Vineland"],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 6,
		maxAge: 6,
		questionnaires: ["Conners 4", "DP-4", "BASC Child", "Vineland"],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 7,
		maxAge: 11,
		questionnaires: ["Conners 4", "BASC Child", "Vineland"],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 12,
		maxAge: 17,
		questionnaires: [
			"Conners 4 Self",
			"Conners 4",
			"BASC Adolescent",
			"Vineland",
		],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 18,
		maxAge: 18,
		questionnaires: ["ABAS 3", "BASC Adolescent", "PAI", "CAARS 2", "Vineland"],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 19,
		maxAge: 21,
		questionnaires: ["ABAS 3", "BASC Adolescent", "SRS-2", "CAARS 2", "PAI"],
	},
	{
		daeval: "EVAL",
		diagnosis: "ASD",
		minAge: 22,
		maxAge: 150,
		questionnaires: ["ABAS 3", "SRS-2", "CAARS 2", "PAI"],
	},

	// DAEVAL (diagnosis=null, check is ignored)
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 2,
		maxAge: 5,
		questionnaires: [
			"Conners EC",
			"ASRS (2-5 Years)",
			"DP-4",
			"BASC Preschool",
			"Vineland",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 6,
		maxAge: 6,
		questionnaires: [
			"Conners 4",
			"ASRS (6-18 Years)",
			"DP-4",
			"BASC Child",
			"Vineland",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 7,
		maxAge: 11,
		questionnaires: [
			"Conners 4",
			"ASRS (6-18 Years)",
			"BASC Child",
			"Vineland",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 12,
		maxAge: 17,
		questionnaires: [
			"Conners 4 Self",
			"Conners 4",
			"ASRS (6-18 Years)",
			"BASC Adolescent",
			"Vineland",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 18,
		maxAge: 18,
		questionnaires: [
			"ASRS (6-18 Years)",
			"ABAS 3",
			"BASC Adolescent",
			"Vineland",
			"PAI",
			"CAARS 2",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 19,
		maxAge: 21,
		questionnaires: [
			"SRS Self",
			"ABAS 3",
			"BASC Adolescent",
			"SRS-2",
			"CAARS 2",
			"PAI",
		],
	},
	{
		daeval: "DAEVAL",
		diagnosis: null,
		minAge: 22,
		maxAge: 150,
		questionnaires: ["SRS Self", "ABAS 3", "SRS-2", "CAARS 2", "PAI"],
	},
];

async function seed() {
	console.log("Seeding questionnaire rules...");

	const existing = await db.query.questionnaireRules.findMany();
	if (existing.length > 0) {
		console.log(`Skipping: ${existing.length} rules already exist.`);
		return;
	}

	await db.insert(questionnaireRules).values(rules);
	console.log(`Inserted ${rules.length} questionnaire rules.`);
}

seed()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
