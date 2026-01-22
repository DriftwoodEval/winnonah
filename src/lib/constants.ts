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

export const PERMISSIONS = {
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

export type PUNCH_SCHEMA = {
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

export const NOTE_TEMPLATES = [
	{
		value: "district-autism",
		label: "District - Autism",
		text: "Testing has been done by the school district and autism is listed in the records.",
	},
	{
		value: "district-no-autism",
		label: "District - No Autism",
		text: "Testing has been done by the school district and autism was not found in the records.",
	},
	{
		value: "outside-autism",
		label: "Outside - Autism",
		text: "Testing has been done by an outside medical provider and autism is listed in the records.",
	},
	{
		value: "outside-no-autism",
		label: "Outside - No Autism",
		text: "Testing has been done by an outside medical provider and autism was not listed in the records.",
	},
	{
		value: "no-response",
		label: "No Response",
		text: "We reached out twice and got no response.",
	},
	{
		value: "no-records",
		label: "No Records",
		text: "No records.",
	},
] as const;

export const ALLOWED_ASD_ADHD_VALUES = [
	"ASD",
	"ADHD",
	"ASD+ADHD",
	"ASD+LD",
	"ADHD+LD",
	"LD",
] as const;
