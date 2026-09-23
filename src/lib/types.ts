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

/**
 * A heading-level flag ("<category>:<subgroup>:all", e.g. "system:issues:all") that
 * grants every permission under that subgroup heading, including ones added later.
 * An explicit value for an individual permission takes precedence over it.
 */
export type PermissionGroupId = {
	[C in Categories]: `${C}:${Subgroups<C> & string}:all`;
}[Categories];

export type PermissionsObject = Partial<
	Record<PermissionId | PermissionGroupId, boolean>
>;
export const permissionsSchema = z.record(z.string(), z.boolean().optional());

export function permissionGroupId(
	categoryKey: string,
	subgroupKey: string,
): PermissionGroupId {
	return `${categoryKey}:${subgroupKey}:all` as PermissionGroupId;
}

/** The heading flag that covers each permission. */
export const PERMISSION_GROUP_IDS = Object.fromEntries(
	Object.entries(PERMISSIONS).flatMap(([categoryKey, category]) =>
		Object.entries(category.subgroups).flatMap(([subgroupKey, subgroup]) =>
			subgroup.permissions.map((p: { id: string }) => [
				p.id,
				permissionGroupId(categoryKey, subgroupKey),
			]),
		),
	),
) as Record<PermissionId, PermissionGroupId>;

export interface GoogleFolder {
	id: string;
	name: string;
}

export interface DuplicateFolder extends GoogleFolder {
	url?: string;
	isDbMatch: boolean;
}

export interface DuplicateGroup {
	clientId: string;
	clientHash: string;
	clientFullName: string;
	folders: DuplicateFolder[];
}
