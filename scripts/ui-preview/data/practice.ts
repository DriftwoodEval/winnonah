import { faker } from "@faker-js/faker";
import type {
	evaluators,
	insurances,
	offices,
	schoolDistricts,
} from "~/server/db/schema";
import { FAKE_CLIENTS } from "./clients";

type Office = typeof offices.$inferSelect;
type Evaluator = typeof evaluators.$inferSelect;
type Insurance = typeof insurances.$inferSelect;
type SchoolDistrict = typeof schoolDistricts.$inferSelect;

faker.seed(7);

export const FAKE_OFFICES: Office[] = [
	{
		key: "Greenville",
		prettyName: "Greenville",
		locationPhrase: "in Greenville",
		address: "100 Main St, Greenville, SC 29601",
		latitude: "34.85260000",
		longitude: "-82.39400000",
		archived: false,
	},
	{
		key: "Columbia",
		prettyName: "Columbia",
		locationPhrase: "in Columbia",
		address: "200 Gervais St, Columbia, SC 29201",
		latitude: "34.00040000",
		longitude: "-81.03480000",
		archived: false,
	},
	{
		key: "Charleston",
		prettyName: "Charleston",
		locationPhrase: "in Charleston",
		address: "300 King St, Charleston, SC 29401",
		latitude: "32.77640000",
		longitude: "-79.93110000",
		archived: false,
	},
	{
		key: "Old Office",
		prettyName: "Old Office (archived)",
		locationPhrase: null,
		address: null,
		latitude: "34.50000000",
		longitude: "-82.00000000",
		archived: true,
	},
];

/** Insurances cover every flag combination: pre-auth, lock-in, ignore balance, multi-appointment. */
const INSURANCE_ROWS: Omit<Insurance, "id">[] = [
	["Aetna", false, false, false, 1],
	["BlueCross BlueShield", true, false, false, 1],
	["Cigna", true, true, false, 2],
	["United Healthcare", false, false, false, 1],
	["Medicaid", true, false, true, 1],
	["Tricare", true, true, false, 3],
	["Molina", false, false, true, 1],
	["BabyNet", false, false, false, 1],
].map(
	([
		shortName,
		preAuthNeeded,
		preAuthLockin,
		ignoreBalance,
		appointmentsRequired,
	]) => ({
		shortName: shortName as string,
		preAuthNeeded: preAuthNeeded as boolean,
		preAuthLockin: preAuthLockin as boolean,
		ignoreBalance: ignoreBalance as boolean,
		appointmentsRequired: appointmentsRequired as number,
		additionalAppts: { maxUnitsPerDay: 6 },
	}),
);

export const FAKE_INSURANCES: Insurance[] = INSURANCE_ROWS.map((row, i) => ({
	...row,
	id: i + 1,
}));

export const FAKE_DISTRICTS: SchoolDistrict[] = [
	"Greenville County",
	"Spartanburg 7",
	"Anderson 1",
	"Charleston County",
	"Horry County",
].map((fullName, i) => ({
	id: i + 1,
	shortName: fullName.split(" ")[0] ?? null,
	fullName,
	isCharter: false,
}));

const evaluatorBase = (
	npi: number,
	overrides: Partial<Evaluator>,
): Evaluator => ({
	npi,
	providerName: faker.person.fullName(),
	email: faker.internet.email(),
	outOfOfficePriority: false,
	archived: false,
	appointmentDurations: {},
	allowedAppointmentTypes: ["DA", "EVAL", "DAEVAL"],
	writesOwnReports: true,
	evaluatorDashboard: true,
	driveFolderId: null,
	evalDriveFolderId: null,
	color: null,
	...overrides,
});

export const FAKE_EVALUATORS: Evaluator[] = [
	evaluatorBase(1111111111, { color: 0 }),
	evaluatorBase(1222222222, {
		color: 1,
		outOfOfficePriority: true,
		allowedAppointmentTypes: ["DA"],
	}),
	evaluatorBase(1333333333, {
		color: 2,
		writesOwnReports: false,
		evaluatorDashboard: false,
	}),
	evaluatorBase(1444444444, { color: 3, archived: true }),
];

const officeKeysFor = (index: number) =>
	FAKE_OFFICES.filter(
		(o) => !o.archived && (index === 0 || o.key !== "Charleston"),
	);

/** `evaluators.getAll` shape: an evaluator plus its joined offices, districts, zips and insurances. */
function evaluatorWithRelations(e: Evaluator, index: number) {
	const insuranceList = FAKE_INSURANCES.filter((_, i) => (i + index) % 2 === 0);
	const officeList = officeKeysFor(index);
	const blockedDistricts = FAKE_DISTRICTS.filter(
		(_, i) => index === 1 && i === 4,
	);
	// The router types these as string & { zip } (a drizzle join quirk), so the rows are cast.
	const blockedZips = (index === 1 ? [{ zip: "29601" }] : []) as never[];
	return {
		...e,
		offices: officeList,
		blockedSchoolDistricts: [],
		blockedZipCodes: [],
		users: [{ id: `user-${e.npi}`, name: e.providerName, email: e.email }],
		blockedDistricts,
		blockedZips,
		insurances: insuranceList,
	};
}

export const evaluatorsAll = () =>
	FAKE_EVALUATORS.filter((e) => !e.archived).map(evaluatorWithRelations);

export const evaluatorsEligibleForClient = () =>
	FAKE_EVALUATORS.filter((e) => !e.archived).map(evaluatorWithRelations);

export const insurancesAll = () =>
	FAKE_INSURANCES.map((insurance, i) => ({
		...insurance,
		aliases: [
			{
				id: i + 1,
				name: `${insurance.shortName} PPO`,
				insuranceId: insurance.id,
			},
		],
		evaluatorNpis: FAKE_EVALUATORS.filter(
			(e, ei) => !e.archived && (i + ei) % 2 === 0,
		).map((e) => e.npi),
	}));

export const officesAll = (input: { includeArchived?: boolean } | undefined) =>
	input?.includeArchived
		? FAKE_OFFICES
		: FAKE_OFFICES.filter((o) => !o.archived);

/** Unique district names used by the fake clients, so lookups by name resolve. */
export const clientDistricts = [
	...new Set(FAKE_CLIENTS.map((c) => c.schoolDistrict).filter(Boolean)),
];

/** `evaluators.getAllZipCodes`: zips offered in the blocked-zip picker. */
export const ZIP_CODES = [
	"29401",
	"29403",
	"29407",
	"29412",
	"29414",
	"29455",
].map((zip) => ({ zip }));

/** `evaluators.getEligibilityDebug`: the "Why?" panel, one row per evaluator in each outcome. */
export const ELIGIBILITY_DEBUG = {
	clientContext: {
		isPrivatePay: false,
		standardizedInsurances: ["Aetna", "Medicaid"],
		schoolDistrict: "Example County",
		zip: "29407",
		age: 9,
		districtCheckSkipped: false,
		districtSkipReason: null,
	},
	evaluators: FAKE_EVALUATORS.map((e, i) => ({
		npi: e.npi,
		name: e.providerName,
		archived: e.archived,
		insuranceEligible: i !== 2,
		insuranceReason: i === 2 ? "Does not accept Medicaid" : "Accepts Aetna",
		districtEligible: i !== 1,
		districtReason:
			i === 1 ? "Blocked for Example County" : "No district restriction",
		eligible: i === 0,
	})),
};
