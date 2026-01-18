import type { inferRouterOutputs } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import z from "zod";
import type { AppRouter } from "~/server/api/root";
import type {
	clients,
	evaluators,
	insurances,
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
export type Insurance = InferSelectModel<typeof insurances>;
export type InsuranceWithAliases = Insurance & { aliases: { name: string }[] };

type EvaluatorSchema = InferSelectModel<typeof evaluators>;

export type Evaluator = EvaluatorSchema & {
	offices: Office[];
	blockedDistricts: SchoolDistrict[];
	blockedZips: ZipCode[];
	insurances: Insurance[];
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
		title: "Clients",
		subgroups: {
			general: {
				title: "General",
				permissions: [
					{ id: "clients:notes", title: "Edit Client Note Title & Content" },
					{ id: "clients:priority", title: "Edit High Priority" },
					{ id: "clients:color", title: "Edit Client Color" },
					{ id: "clients:drive", title: "Edit Drive Links" },
					{ id: "clients:schooldistrict", title: "Edit School District" },
					{ id: "clients:asdadhd", title: "Edit ASD/ADHD" },
					{ id: "clients:babynet", title: "Edit BabyNet Status" },
					{ id: "clients:ei", title: "Edit EI Attends Status" },
					{ id: "clients:autismstop:enable", title: "Enable Autism Stop" },
					{ id: "clients:autismstop:disable", title: "Disable Autism Stop" },
				],
			},

			questionnaires: {
				title: "Questionnaires",
				permissions: [
					{
						id: "clients:questionnaires:create",
						title: "Create Questionnaires",
					},
					{
						id: "clients:questionnaires:createexternal",
						title: "Create External Questionnaires",
					},
					{
						id: "clients:questionnaires:createbulk",
						title: "Create Bulk Questionnaires",
					},
				],
			},
			records: {
				title: "Records",
				permissions: [
					{ id: "clients:records:needed", title: "Set Records Needed" },
					{
						id: "clients:records:requested",
						title: "Set Records Requested",
					},
					{ id: "clients:records:reviewed", title: "Set Records Reviewed" },
					{
						id: "clients:records:ifsp",
						title: "Set IFSP Needed/IFSP Downloaded",
					},
				],
			},
			admin: {
				title: "Administration",
				permissions: [
					{ id: "clients:shell", title: "Create Fake/Shell Client Notes" },
					{ id: "clients:merge", title: "Merge with Real Client Record" },
				],
			},
		},
	},
	system: {
		title: "System",
		subgroups: {
			settings: {
				title: "Settings",
				permissions: [
					{ id: "settings:users:edit", title: "Edit Users" },
					{ id: "settings:users:invite", title: "Invite Users" },
					{ id: "settings:evaluators", title: "Manage Evaluators" },
					{ id: "settings:insurances", title: "Manage Insurances" },
					{ id: "settings:testUnits", title: "Manage Test Units" },
				],
			},
			qsuite: {
				title: "QSuite",
				permissions: [
					{
						id: "settings:qsuite:general",
						title: "Edit QSuite General Config",
					},
					{
						id: "settings:qsuite:services",
						title: "Edit QSuite Services Config",
					},
					{
						id: "settings:qsuite:records",
						title: "Edit QSuite Records Config",
					},
					{
						id: "settings:qsuite:piecework",
						title: "Edit QSuite Piecework Config",
					},
				],
			},
		},
	},
	pages: {
		title: "Pages",
		subgroups: {
			access: {
				title: "Access",
				permissions: [
					{ id: "pages:dashboard", title: "Dashboard" },
					{ id: "pages:calculator", title: "Calculator" },
					{ id: "pages:scheduling", title: "Scheduling" },
					{ id: "pages:qsuite-config", title: "QSuite Config" },
				],
			},
		},
	},
} as const;

type PermissionsType = typeof permissions;
type Categories = keyof PermissionsType;
type Subgroups<C extends Categories> = keyof PermissionsType[C]["subgroups"];

export type PermissionId = {
	[C in Categories]: {
		[S in Subgroups<C>]: PermissionsType[C]["subgroups"][S] extends {
			permissions: readonly { id: infer ID }[];
		}
			? ID
			: never;
	}[Subgroups<C>];
}[Categories];

export type PermissionsObject = Partial<Record<PermissionId, boolean>>;
export const permissionsSchema = z.record(z.string(), z.boolean().optional());

const allPermissionIds = Object.values(permissions).flatMap((category) =>
	Object.values(category.subgroups).flatMap((subgroup) =>
		subgroup.permissions.map((p: { id: string }) => p.id),
	),
) as PermissionId[];

const basePermissions = Object.fromEntries(
	allPermissionIds.map((id) => [id, false]),
) as Record<PermissionId, boolean>;

const getPermissionsForPreset = (
	ids: PermissionId[],
): Record<PermissionId, boolean> => {
	const perms = { ...basePermissions };
	for (const id of ids) {
		perms[id] = true;
	}
	return perms;
};

export const permissionPresets = [
	{
		value: "user",
		label: "User",
		permissions: getPermissionsForPreset(["clients:autismstop:enable"]),
	},
	{
		value: "admin",
		label: "Admin",
		permissions: getPermissionsForPreset([
			"clients:autismstop:enable",
			"clients:notes",
			"clients:priority",
			"clients:color",
			"clients:babynet",
			"clients:ei",
			"clients:drive",
			"clients:schooldistrict",
			"clients:shell",
			"clients:merge",
			"clients:asdadhd",
			"clients:questionnaires:create",
			"clients:questionnaires:createexternal",
			"settings:evaluators",
			"settings:insurances",
			"clients:records:needed",
			"clients:records:ifsp",
		]),
	},
	{
		value: "superadmin",
		label: "Super Admin",
		permissions: Object.fromEntries(
			allPermissionIds.map((id) => [id, true]),
		) as Record<PermissionId, boolean>,
	},
];

export type PunchClient = {
	"Client Name": string | undefined;
	"Client ID": string | undefined;
	For: string | undefined;
	Language: string | undefined;
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

export type MergeSuggestion = NonNullable<
	ClientRouterOutput["getMergeSuggestions"]
>[number];

export const ALLOWED_ASD_ADHD_VALUES = [
	"ASD",
	"ADHD",
	"ASD+ADHD",
	"ASD+LD",
	"ADHD+LD",
	"LD",
] as const;
