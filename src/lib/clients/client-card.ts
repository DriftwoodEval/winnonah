export const CLIENT_CARD_GROUPS = [
	"Basics",
	"Contact",
	"Insurance",
	"Status",
] as const;

export type ClientCardGroup = (typeof CLIENT_CARD_GROUPS)[number];

/** Fields the hover card can show, in the order they are displayed. */
export const CLIENT_CARD_FIELDS = [
	{ id: "name", label: "Name", group: "Basics" },
	{ id: "colorDot", label: "Color dot (next to name)", group: "Basics" },
	{ id: "age", label: "Age", group: "Basics" },
	{ id: "dob", label: "Date of birth", group: "Basics" },
	{ id: "gender", label: "Gender", group: "Basics" },
	{ id: "language", label: "Language", group: "Basics" },
	{ id: "asdAdhd", label: "Evaluation type", group: "Basics" },
	{ id: "phone", label: "Phone", group: "Contact" },
	{ id: "email", label: "Email", group: "Contact" },
	{ id: "address", label: "Address", group: "Contact" },
	{ id: "schoolDistrict", label: "School district", group: "Contact" },
	{ id: "primaryInsurance", label: "Primary insurance", group: "Insurance" },
	{
		id: "secondaryInsurance",
		label: "Secondary insurance",
		group: "Insurance",
	},
	{ id: "precertExpires", label: "PA expires", group: "Insurance" },
	{ id: "balance", label: "Outstanding balance", group: "Insurance" },
	{ id: "highPriority", label: "High priority indicator", group: "Status" },
	{ id: "paused", label: "Paused indicator", group: "Status" },
	{
		id: "otherIndicators",
		label: "BabyNet and autism stop indicators",
		group: "Status",
	},
	{ id: "nextAppointment", label: "Next appointment", group: "Status" },
	{
		id: "pendingQuestionnaires",
		label: "Pending questionnaires",
		group: "Status",
	},
	{ id: "addedDate", label: "Date added", group: "Status" },
] as const;

export type ClientCardFieldId = (typeof CLIENT_CARD_FIELDS)[number]["id"];

export const CLIENT_CARD_FIELD_IDS = CLIENT_CARD_FIELDS.map(
	(field) => field.id,
) as [ClientCardFieldId, ...ClientCardFieldId[]];

export const DEFAULT_CLIENT_CARD_FIELDS: ClientCardFieldId[] = [
	"age",
	"primaryInsurance",
	"highPriority",
	"paused",
	"otherIndicators",
	"nextAppointment",
];

/**
 * Turns a saved field list into a valid selection: unknown and duplicate ids
 * are dropped, and a user with nothing saved gets the defaults. An empty
 * saved list is kept, since it means the user turned every field off.
 */
export function mergeClientCardFields(stored: unknown): ClientCardFieldId[] {
	if (!Array.isArray(stored)) return DEFAULT_CLIENT_CARD_FIELDS;
	const known = new Set<string>(CLIENT_CARD_FIELD_IDS);
	const selected = new Set(
		stored.filter((id): id is ClientCardFieldId => known.has(id)),
	);
	return CLIENT_CARD_FIELD_IDS.filter((id) => selected.has(id));
}

export interface ClientCardSummary {
	id: number;
	fullName: string;
	color: string;
	dob: string;
	gender: string | null;
	language: string | null;
	asdAdhd: string | null;
	phoneNumber: string | null;
	email: string | null;
	address: string | null;
	schoolDistrict: string | null;
	primaryInsurance: string | null;
	secondaryInsurance: string[] | null;
	precertExpires: string | null;
	privatePay: boolean;
	outstandingBalance: number;
	addedDate: string | null;
	highPriority: boolean;
	babyNet: boolean;
	pause: boolean;
	autismStop: boolean;
	pendingQuestionnaires: number;
	nextAppointment: {
		startTime: Date;
		evaluatorName: string;
		officeName: string | null;
	} | null;
}
