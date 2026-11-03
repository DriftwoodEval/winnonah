import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";

export const LOGIN_VERBS = ["view", "edit", "delete"] as const;
export type LoginVerb = (typeof LOGIN_VERBS)[number];

export const LOGIN_VERB_LABELS: Record<LoginVerb, string> = {
	view: "View",
	edit: "Edit",
	delete: "Delete",
};

/** The credential fields every custom login has. */
export const CUSTOM_LOGIN_FIELDS = [
	{ name: "username", label: "User", secret: false },
	{ name: "password", label: "Password", secret: true },
] as const;

/**
 * Logins whose credentials live in the Python config's `services` block, where
 * the Python scripts read them. They show up on the Logins page and can be
 * edited there but not created or deleted. `fields` names the keys inside
 * `services[key]` that the page shows and edits.
 */
export const BUILT_IN_LOGINS = [
	{
		key: "mhs",
		name: "MHS",
		url: "https://assessments.mhs.com",
		notes:
			"MHS Online Assessment Center. Used to send and check questionnaires that are delivered through MHS.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
		],
	},
	{
		key: "qglobal",
		name: "QGlobal",
		url: "https://qglobal.pearsonassessments.com",
		notes:
			"Pearson Q-global. Used to send and check questionnaires delivered through Pearson. Pearson may ask for a verification code at sign-in: use Fetch token email to get it.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
		],
	},
	{
		key: "wps",
		name: "WPS",
		url: "https://platform.wpspublish.com",
		notes:
			"WPS Online Evaluation System. Used to send and check questionnaires delivered through WPS.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
		],
	},
	{
		key: "novopsych",
		name: "NovoPsych",
		url: "https://novopsych.com",
		notes:
			"NovoPsych. Used to send and check questionnaires delivered through NovoPsych.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
		],
	},
	{
		key: "medicaid",
		name: "SC Medicaid",
		url: "https://portal.scmedicaid.com",
		notes:
			"SC Medicaid provider portal. Used to check whether clients on Medicaid are eligible.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
		],
	},
	{
		key: "therapyappointment",
		name: "TherapyAppointment",
		url: "https://portal.therapyappointment.com",
		notes:
			"TherapyAppointment, our practice management system. The admin login is the one the automated exports and syncs sign in with.",
		fields: [
			{ name: "username", label: "User", secret: false },
			{ name: "password", label: "Password", secret: true },
			{ name: "admin_username", label: "Admin User", secret: false },
			{ name: "admin_password", label: "Admin Password", secret: true },
		],
	},
	{
		key: "openphone",
		name: "Quo",
		url: "https://my.quo.com",
		notes:
			"Quo (formerly OpenPhone), our texting and phone service. The API key lets the system send reminders and read replies from the main number. Staff phone lines are managed under Settings > QSuite.",
		fields: [
			{ name: "key", label: "API Key", secret: true },
			{ name: "main_number", label: "Main Number", secret: false },
		],
	},
	{
		key: "kimai",
		name: "Kimai",
		url: null,
		notes:
			"Kimai time tracking. The token lets the piecework report pull timesheets.",
		fields: [
			{ name: "url", label: "URL", secret: false },
			{ name: "token", label: "Token", secret: true },
		],
	},
] as const;

export type BuiltInLoginKey = (typeof BUILT_IN_LOGINS)[number]["key"];

export function getBuiltInLogin(key: string | null) {
	return BUILT_IN_LOGINS.find((def) => def.key === key);
}

/**
 * The key in a permissions object that grants one verb on one login. Logins
 * are created at runtime, so these keys are not part of the static PERMISSIONS
 * list in constants.ts.
 */
export function loginPermissionKey(loginId: number, verb: LoginVerb) {
	return `logins:${loginId}:${verb}`;
}

function hasLoginPermission(
	permissions: PermissionsObject,
	loginId: number,
	verb: LoginVerb,
) {
	const granted = permissions as Record<string, boolean | undefined>;
	return granted[loginPermissionKey(loginId, verb)] === true;
}

/**
 * Whether a user may view, edit, or delete a login. Global permissions cover
 * every login; otherwise the login's own permissions decide, where edit and
 * delete both include viewing.
 */
export function canAccessLogin(
	user: { permissions: PermissionsObject },
	login: { id: number },
	verb: LoginVerb,
): boolean {
	const { permissions } = user;
	const canEditAll = hasPermission(permissions, "settings:qsuite:services");
	if (verb === "view") {
		if (
			canEditAll ||
			hasPermission(permissions, "settings:qsuite:services:view")
		) {
			return true;
		}
	}
	if (verb === "edit" && canEditAll) return true;
	if (
		verb === "delete" &&
		hasPermission(permissions, "settings:qsuite:logins:delete")
	) {
		return true;
	}

	const grantingVerbs: LoginVerb[] =
		verb === "view" ? ["view", "edit", "delete"] : [verb];
	return grantingVerbs.some((v) =>
		hasLoginPermission(permissions, login.id, v),
	);
}
