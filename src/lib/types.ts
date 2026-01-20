import z from "zod";

import { PERMISSIONS } from "./constants";

type PermissionsType = typeof PERMISSIONS;
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

const allPermissionIds = Object.values(PERMISSIONS).flatMap((category) =>
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
