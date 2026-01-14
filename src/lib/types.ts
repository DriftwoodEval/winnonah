import type { inferRouterOutputs } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import z from "zod";
import type { AppRouter } from "~/server/api/root";
import type {
	clients,
	evaluators,
	invitations,
	offices,
	questionnaires,
	schoolDistricts,
	testUnits,
	users,
	zipCodes,
} from "~/server/db/schema";

type ClientRouterOutput = inferRouterOutputs<AppRouter>["clients"];

export type Client = InferSelectModel<typeof clients>;
export type ClientWithOffice = ClientRouterOutput["getOne"];
export type SortedClient = ClientRouterOutput["search"]["clients"][0];
export type ClientWithIssueInfo = Client & {
	additionalInfo?: string;
	initialFailureDate?: Date;
};

export type InsertingQuestionnaire = Pick<
	InferSelectModel<typeof questionnaires>,
	Exclude<keyof InferSelectModel<typeof questionnaires>, "id" | "updatedAt">
>;

export type User = InferSelectModel<typeof users>;
export type Invitation = InferSelectModel<typeof invitations>;

export type Office = InferSelectModel<typeof offices>;
export type SchoolDistrict = InferSelectModel<typeof schoolDistricts>;
export type ZipCode = InferSelectModel<typeof zipCodes>;

type EvaluatorSchema = InferSelectModel<typeof evaluators>;

export type Evaluator = Omit<EvaluatorSchema, "offices"> & {
	offices: Office[];
	blockedDistricts: SchoolDistrict[];
	blockedZips: ZipCode[];
};

export type TestUnit = InferSelectModel<typeof testUnits>;

export type GoogleRouterOutput = inferRouterOutputs<AppRouter>["google"];
export type DuplicateDriveGroup = NonNullable<
	GoogleRouterOutput["findDuplicates"]
>["data"][number];

export type QuestionnaireRouterOutput =
	inferRouterOutputs<AppRouter>["questionnaires"];
export type DuplicateQLinksData = NonNullable<
	QuestionnaireRouterOutput["getDuplicateLinks"]
>;
export type SharedQuestionnaireData =
	DuplicateQLinksData["sharedAcrossClients"][number];

export const QUESTIONNAIRE_STATUSES = [
	"PENDING",
	"COMPLETED",
	"POSTEVAL_PENDING",
	"IGNORING",
	"SPANISH",
	"LANGUAGE",
	"TEACHER",
	"EXTERNAL",
	"ARCHIVED",
	"JUST_ADDED",
] as const;

export const TEST_NAMES = [
	"Testman Testson",
	"Testman Testson Jr.",
	"Johnny Smonny",
	"Johnny Smonathan",
	"Test Mctest",
	"Test Test",
	"Barbara Steele",
] as const;

export const permissions = {
	clients: {
		title: "Client Management",
		permissions: [
			{ id: "clients:notes", title: "Edit Client Note Title & Content" },
			{ id: "clients:priority", title: "Edit High Priority Status" },
			{ id: "clients:color", title: "Edit Client Color" },
			{ id: "clients:babynet", title: "Edit BabyNet Status" },
			{ id: "clients:ei", title: "Edit EI Attends Status" },
			{ id: "clients:drive", title: "Edit Drive Links" },
			{ id: "clients:schooldistrict", title: "Edit School District" },
			{ id: "clients:shell", title: "Create Fake/Shell Client Notes" },
			{ id: "clients:merge", title: "Merge with Real Client Record" },
			{ id: "clients:autismstop:enable", title: "Enable Autism Stop" },
			{ id: "clients:autismstop:disable", title: "Disable Autism Stop" },
			{ id: "clients:questionnaires:create", title: "Create Questionnaires" },
			{
				id: "clients:questionnaires:createexternal",
				title: "Create External Questionniares",
			},
			{
				id: "clients:questionnaires:createbulk",
				title: "Create Bulk Questionnaires",
			},
		],
	},
	system: {
		title: "System Settings",
		permissions: [
			{ id: "settings:users:edit", title: "Edit Users" },
			{ id: "settings:users:invite", title: "Invite Users" },
			{ id: "settings:evaluators", title: "Manage Evaluators" },
			{ id: "settings:testUnits", title: "Manage Test Units" },
		],
	},
	pages: {
		title: "Pages Access",
		permissions: [
			{ id: "pages:dashboard", title: "Dashboard" },
			{ id: "pages:calculator", title: "Calculator" },
			{ id: "pages:scheduling", title: "Scheduling" },
		],
	},
} as const;

export type PermissionId =
	(typeof permissions)[keyof typeof permissions]["permissions"][number]["id"];
export type PermissionsObject = Partial<Record<PermissionId, boolean>>;
export const permissionsSchema = z.record(z.string(), z.boolean().optional());

const allPermissionIds = Object.values(permissions).flatMap((group) =>
	group.permissions.map((p) => p.id),
);
const basePermissions = Object.fromEntries(
	allPermissionIds.map((id) => [id, false]),
);

export const permissionPresets = [
	{
		value: "user",
		label: "User",
		permissions: { ...basePermissions, "clients:autismstop:enable": true },
	},
	{
		value: "admin",
		label: "Admin",
		permissions: {
			...basePermissions,
			"clients:autismstop:enable": true,
			"clients:notes": true,
			"clients:priority": true,
			"clients:color": true,
			"clients:babynet": true,
			"clients:ei": true,
			"clients:drive": true,
			"clients:schooldistrict": true,
			"clients:shell": true,
			"clients:merge": true,
			"clients:questionnaires:create": true,
			"clients:questionniares:createexternal": true,
			"settings:evaluators": true,
		},
	},
	{
		value: "superadmin",
		label: "Super Admin",
		permissions: Object.fromEntries(allPermissionIds.map((id) => [id, true])),
	},
];

export type PunchClient = {
	"Client Name": string | undefined;
	"Client ID": string | undefined;
	For: string | undefined;
	Language: string | undefined;
	"Records Needed": string | undefined;
	"Records Requested?": string | undefined;
	"Records Reviewed?": string | undefined;
	"DA Qs Needed": string | undefined;
	"DA Qs Sent": string | undefined;
	"DA Qs Done": string | undefined;
	"DA Scheduled": string | undefined;
	"EVAL Qs Needed": string | undefined;
	"EVAL Qs Sent": string | undefined;
	"EVAL Qs Done": string | undefined;
	"PA Assigned to": string | undefined;
	"PA Expiration": string | undefined;
	"Primary Payer": string | undefined;
	"Secondary Payer": string | undefined;
	"EVAL date": string | undefined;
	Location: string | undefined;
	Comments: string | undefined;
	"DA IN FOLDER/ NEEDS REPT WRITTEN": string | undefined;
	"Protocols scanned?": string | undefined;
	"Ready to assign?": string | undefined;
	Evaluator: string | undefined;
	"Assigned to OR added to report writing folder": string | undefined;
	"MCS Review Needed": string | undefined;
	"AJP Review Done/Hold for payroll": string | undefined;
	"BRIDGES billed?": string | undefined;
	"Billed?": string | undefined;
	hash: string;
};

export type FullClientInfo = PunchClient & Client;
