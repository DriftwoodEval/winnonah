import { faker } from "@faker-js/faker";
import { CLIENT_COLOR_KEYS } from "~/lib/colors";
import type { clients } from "~/server/db/schema";

export type FakeClient = typeof clients.$inferSelect;

/**
 * Fake clients for the UI preview. Two groups:
 * 1. A matrix where row `i` takes value `i % values.length` from every axis, so each value of each
 *    axis appears at least once and axes are decorrelated by using coprime-ish strides.
 * 2. Hand-written edge cases (long names, unicode, missing data) and notes-only clients (5-digit ids).
 */

const NOW = new Date("2026-11-21T15:00:00.000Z");

/** Small deterministic PRNG so the dataset is identical on every run. */
function mulberry32(seed: number) {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const random = mulberry32(20261121);
const pick = <T>(values: readonly T[]): T =>
	values[Math.floor(random() * values.length)] as T;
const chance = (p: number) => random() < p;

function dateOffset(days: number): string {
	const d = new Date(NOW.getTime() + days * 86_400_000);
	return d.toISOString().slice(0, 10);
}

faker.seed(20261121);

const usedNames = new Set<string>();

/** A faker name that no earlier fake client has. */
function uniqueName(): { first: string; last: string } {
	for (;;) {
		const first = faker.person.firstName();
		const last = faker.person.lastName();
		if (!usedNames.has(`${first} ${last}`)) {
			usedNames.add(`${first} ${last}`);
			return { first, last };
		}
	}
}
const INSURANCES = [
	"Aetna",
	"BlueCross BlueShield",
	"Cigna",
	"United Healthcare",
	"Medicaid",
	"Tricare",
	"Molina",
];
const DISTRICTS = [
	"Greenville County",
	"Spartanburg 7",
	"Anderson 1",
	"Charleston County",
	"Horry County",
];
const ASD_ADHD = [
	"ASD",
	"ADHD",
	"ASD+ADHD",
	"ASD+LD",
	"ADHD+LD",
	"LD",
	null,
] as const;
const GENDERS = ["Male", "Female", "Other", null] as const;
const LANGUAGES = ["English", "Spanish", "Arabic", "Vietnamese", null];
const REFERRAL_SOURCES = ["Pediatrician", "School", "Parent", "EI", null];
const RECORDS = ["Needed", "Not Needed", null] as const;
/** Ages in years, spanning infant to adult. */
const AGES = [0.5, 1.5, 2.5, 4, 6, 8, 11, 14, 17, 19, 27, 45];
/** Days from today: expired, soon, far, none. */
const PRECERT = [-40, 12, 200, null];

function blank(id: number, firstName: string, lastName: string): FakeClient {
	return {
		id,
		hash: `hash${id}`,
		status: true,
		asanaId: null,
		archivedInAsana: false,
		driveId: `drive-${id}`,
		driveFolderEvaluatorNpi: null,
		driveFolderIsEval: false,
		addedDate: dateOffset(-30),
		dob: dateOffset(-365 * 8),
		firstName,
		lastName,
		preferredName: null,
		fullName: `${firstName} ${lastName}`,
		address: "123 Main St, Greenville, SC 29601",
		schoolDistrict: "Greenville County",
		latitude: "34.85260000",
		longitude: "-82.39400000",
		primaryInsurance: "Aetna",
		secondaryInsurance: null,
		outstandingBalance: 0,
		qualCategory: null,
		paymentCategory: null,
		medicaidOrganization: null,
		medicaidProviderId: null,
		medicaidCarrier1: null,
		medicaidCarrier2: null,
		limitedBenefit: null,
		medicaidSpecialProgram: null,
		medicaidSpecialProgramMessage: null,
		medicaidBeneficiaryStatus: null,
		medicaidPolicyId: null,
		medicaidCheckedAt: null,
		medicaidNotFound: false,
		medicaidRecheck: false,
		precertExpires: null,
		privatePay: false,
		sessionStartedAt: null,
		deactivatedAt: null,
		asdAdhd: null,
		language: "English",
		paAssignedTo: null,
		phoneNumber: "864-555-0100",
		email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
		gender: null,
		color: "gray",
		highPriority: false,
		babyNet: false,
		autismStop: false,
		alreadyDx: false,
		pause: false,
		eiContactId: null,
		eiRemindersEnabled: false,
		flag: null,
		taHash: null,
		taUser: null,
		recordsNeeded: null,
		babyNetERNeeded: false,
		babyNetERDownloaded: false,
		evaluationInProcess: false,
		referralSource: "Pediatrician",
		referralData: null,
		assessmentData: null,
	};
}

const MATRIX_SIZE = 120;

function matrixClient(i: number): FakeClient {
	const { first, last } = uniqueName();
	const c = blank(100_000 + i, first, last);
	const ageYears = AGES[i % AGES.length] as number;
	const insurance = INSURANCES[i % INSURANCES.length] as string;
	const isMedicaid = insurance === "Medicaid";
	const precertDays = PRECERT[i % PRECERT.length];

	Object.assign(c, {
		status: i % 9 !== 0,
		dob: dateOffset(-Math.round(ageYears * 365)),
		addedDate: dateOffset(-Math.floor(random() * 400)),
		color: CLIENT_COLOR_KEYS[i % CLIENT_COLOR_KEYS.length],
		asdAdhd: ASD_ADHD[i % ASD_ADHD.length],
		gender: GENDERS[i % GENDERS.length],
		language: LANGUAGES[i % LANGUAGES.length],
		referralSource: REFERRAL_SOURCES[i % REFERRAL_SOURCES.length],
		recordsNeeded: RECORDS[i % RECORDS.length],
		primaryInsurance: i % 17 === 0 ? null : insurance,
		secondaryInsurance: chance(0.25) ? [pick(INSURANCES)] : null,
		address:
			i % 15 === 0
				? null
				: `${faker.location.streetAddress()}, ${faker.location.city()}, SC ${faker.location.zipCode("#####")}`,
		schoolDistrict: i % 11 === 0 ? null : pick(DISTRICTS),
		latitude: i % 13 === 0 ? null : (34 + random()).toFixed(8),
		longitude: i % 13 === 0 ? null : (-82 - random()).toFixed(8),
		driveId: i % 7 === 0 ? null : `drive-${c.id}`,
		precertExpires: precertDays == null ? null : dateOffset(precertDays),
		outstandingBalance: i % 5 === 0 ? Math.round(random() * 90_000) / 100 : 0,
		privatePay: i % 14 === 0,
		highPriority: i % 8 === 1,
		babyNet: ageYears < 3,
		babyNetERNeeded: ageYears < 3 && i % 2 === 0,
		babyNetERDownloaded: ageYears < 3 && i % 4 === 0,
		autismStop: i % 19 === 0,
		alreadyDx: i % 6 === 2,
		pause: i % 23 === 0,
		evaluationInProcess: i % 10 === 3,
		eiRemindersEnabled: ageYears < 3 && i % 3 === 0,
		preferredName: i % 4 === 0 ? faker.person.firstName() : null,
		flag: i % 29 === 0 ? "Call before scheduling" : null,
		referralData: i % 5 === 2 ? { needsReachOut: "review" as const } : null,
		paAssignedTo: i % 6 === 0 ? "Preview User" : null,
		phoneNumber:
			i % 31 === 0 ? null : faker.phone.number({ style: "national" }),
		email:
			i % 12 === 0
				? null
				: faker.internet.email({ firstName: first, lastName: last }),
		sessionStartedAt: i % 10 === 3 ? NOW : null,
		deactivatedAt:
			i % 9 === 0 ? new Date(NOW.getTime() - 5 * 86_400_000) : null,
		archivedInAsana: i % 9 === 0 && i % 2 === 0,
	} satisfies Partial<FakeClient>);
	c.fullName = `${c.firstName} ${c.lastName}`;

	if (isMedicaid) {
		Object.assign(c, {
			medicaidOrganization: "Select Health of SC",
			medicaidProviderId: "HM4200",
			medicaidPolicyId: `policy-${c.id}`,
			medicaidCarrier1: "Select Health",
			medicaidCarrier2: i % 2 === 0 ? "Molina" : null,
			medicaidBeneficiaryStatus: i % 3 === 0 ? "INELIGIBLE" : "ELIGIBLE",
			medicaidCheckedAt: new Date(NOW.getTime() - 3 * 86_400_000),
			medicaidNotFound: i % 4 === 0,
			medicaidRecheck: i % 5 === 0,
			limitedBenefit: i % 6 === 0 ? "Family Planning Only" : null,
			medicaidSpecialProgram: i % 7 === 0 ? "Katie Beckett" : null,
			medicaidSpecialProgramMessage:
				i % 7 === 0 ? "Enrolled in a special program." : null,
		} satisfies Partial<FakeClient>);
	}
	return c;
}

const edgeCases: FakeClient[] = [
	{
		...blank(
			200_001,
			"Maximiliano-Bartholomew",
			"Featherstonehaugh-Wolfeschlegelstein",
		),
		preferredName: "Max",
		address:
			"4521 Extraordinarily Long Boulevard Name Suite 1200, Greenville, SC 29601",
		schoolDistrict: "A School District With A Remarkably Long Official Name",
	},
	{ ...blank(200_002, "José", "Muñoz-Peña"), language: "Spanish" },
	{ ...blank(200_003, "Zoë", "O'Brien"), language: "Irish" },
	{ ...blank(200_004, "A", "B"), preferredName: "AB" },
	{
		...blank(200_005, "Everything", "Missing"),
		driveId: null,
		address: null,
		schoolDistrict: null,
		latitude: null,
		longitude: null,
		primaryInsurance: null,
		phoneNumber: null,
		email: null,
		referralSource: null,
		language: null,
		addedDate: null,
	},
	{
		...blank(200_006, "Every", "Flag"),
		highPriority: true,
		babyNet: true,
		autismStop: true,
		alreadyDx: true,
		pause: true,
		evaluationInProcess: true,
		privatePay: true,
		babyNetERNeeded: true,
		eiRemindersEnabled: true,
		recordsNeeded: "Needed",
		outstandingBalance: 12_345.67,
		flag: "Multiple flags set for layout testing",
		secondaryInsurance: ["Cigna", "Tricare", "Molina"],
	},
	{
		...blank(200_007, "Inactive", "Deactivated"),
		status: false,
		deactivatedAt: new Date("2026-09-01T12:00:00.000Z"),
	},
];

/** Notes-only clients have a 5-digit id and exist only to hold notes. */
const notesOnly: FakeClient[] = [
	blank(10_001, "Notes", "Only"),
	{ ...blank(10_002, "Pending", "Intake"), driveId: null, dob: "2020-01-01" },
];

export const FAKE_CLIENTS: FakeClient[] = [
	...Array.from({ length: MATRIX_SIZE }, (_, i) => matrixClient(i)),
	...edgeCases,
	...notesOnly,
];

export const isNotesOnlyClient = (c: FakeClient) => String(c.id).length === 5;
