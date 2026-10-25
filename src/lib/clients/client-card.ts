/** The sections of the card, top to bottom. */
export const CLIENT_CARD_GROUPS = [
	"Title",
	"Badges",
	"Quick facts",
	"Details",
] as const;

export type ClientCardGroup = (typeof CLIENT_CARD_GROUPS)[number];

/**
 * Fields the hover card can show, in the order they are displayed: grouped by
 * card section, and within a section in the order the card renders them.
 */
export const CLIENT_CARD_FIELDS = [
	{ id: "name", label: "Name", group: "Title" },
	{ id: "colorDot", label: "Color dot (next to name)", group: "Title" },
	{ id: "clientId", label: "Client ID", group: "Badges" },
	{ id: "status", label: "Active/Inactive", group: "Badges" },
	{ id: "highPriority", label: "High priority indicator", group: "Badges" },
	{ id: "paused", label: "Paused indicator", group: "Badges" },
	{ id: "babyNet", label: "BabyNet indicator", group: "Badges" },
	{ id: "autismStop", label: "Autism stop indicator", group: "Badges" },
	{ id: "alreadyDx", label: "Already diagnosed indicator", group: "Badges" },
	{ id: "balance", label: "Outstanding balance", group: "Badges" },
	{ id: "dashboardStatus", label: "Dashboard status", group: "Badges" },
	{ id: "age", label: "Age", group: "Quick facts" },
	{ id: "gender", label: "Gender", group: "Quick facts" },
	{ id: "language", label: "Language", group: "Quick facts" },
	{ id: "asdAdhd", label: "ASD/ADHD", group: "Quick facts" },
	{ id: "dob", label: "Date of birth", group: "Details" },
	{ id: "phone", label: "Phone", group: "Details" },
	{ id: "email", label: "Email", group: "Details" },
	{ id: "address", label: "Address", group: "Details" },
	{ id: "schoolDistrict", label: "School district", group: "Details" },
	{ id: "primaryInsurance", label: "Primary insurance", group: "Details" },
	{
		id: "secondaryInsurance",
		label: "Secondary insurance",
		group: "Details",
	},
	{ id: "precertExpires", label: "PA expires", group: "Details" },
	{ id: "nextAppointment", label: "Next appointment", group: "Details" },
	{ id: "lastAppointment", label: "Last appointment", group: "Details" },
	{ id: "assignedEvaluators", label: "Assigned evaluators", group: "Details" },
	{
		id: "pendingQuestionnaires",
		label: "Pending questionnaires",
		group: "Details",
	},
	{ id: "addedDate", label: "Date added", group: "Details" },
] as const;

export type ClientCardFieldId = (typeof CLIENT_CARD_FIELDS)[number]["id"];

export const CLIENT_CARD_FIELD_IDS = CLIENT_CARD_FIELDS.map(
	(field) => field.id,
) as [ClientCardFieldId, ...ClientCardFieldId[]];

export const DEFAULT_CLIENT_CARD_FIELDS: ClientCardFieldId[] = [
	"name",
	"colorDot",
	"age",
	"asdAdhd",
	"highPriority",
	"paused",
	"babyNet",
	"autismStop",
	"alreadyDx",
	"dashboardStatus",
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

export interface ClientCardAppointment {
	startTime: Date;
	evaluatorName: string;
	officeName: string | null;
}

export interface ClientCardSummary {
	id: number;
	status: boolean;
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
	alreadyDx: boolean;
	pendingQuestionnaires: number;
	nextAppointment: ClientCardAppointment | null;
	lastAppointment: ClientCardAppointment | null;
	assignedEvaluators: string[];
	/** Dashboard sections the client is in; filled in on the client from the dashboard query. */
	dashboardSections: string[];
}
