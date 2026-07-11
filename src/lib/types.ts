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

export const allPermissionIds = Object.values(PERMISSIONS).flatMap((category) =>
	Object.values(category.subgroups).flatMap((subgroup) =>
		subgroup.permissions.map((p: { id: string }) => p.id),
	),
) as PermissionId[];

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

export interface FolderResponse {
	folders: GoogleFolder[];
	message?: string;
}
