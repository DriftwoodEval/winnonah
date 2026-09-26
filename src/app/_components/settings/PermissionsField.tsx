"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { FormLabel } from "@ui/form";
import { Input } from "@ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { PERMISSIONS } from "~/lib/constants";
import {
	PERMISSION_GROUP_IDS,
	type PermissionGroupId,
	type PermissionId,
	type PermissionsObject,
	permissionGroupId,
} from "~/lib/types";
import { hasPermission } from "~/lib/utils";

type PermissionEntry = { id: string; title: string; parent?: string };

const isPermissionId = (key: string): key is PermissionId =>
	key in PERMISSION_GROUP_IDS;

interface PermissionsFieldProps {
	value: PermissionsObject;
	onChange: (permissions: PermissionsObject) => void;
	disabled?: boolean;
	isPermissionDisabled?: (id: string) => boolean;
	/** The permissions inherited from an assigned role, if any. `value` acts as overrides on top of these. */
	basePermissions?: PermissionsObject;
}

export function PermissionsField({
	value,
	onChange,
	disabled = false,
	isPermissionDisabled = () => false,
	basePermissions = {},
}: PermissionsFieldProps) {
	const [query, setQuery] = useState("");
	const [manualOpenItems, setManualOpenItems] = useState<string[]>([]);
	const trimmedQuery = query.trim().toLowerCase();
	const hasQuery = trimmedQuery.length > 0;

	const effective: PermissionsObject = { ...basePermissions, ...value };
	const showOverrides = Object.keys(basePermissions).length > 0;

	const titleMatches = (title: string) =>
		title.toLowerCase().includes(trimmedQuery);

	const isOverridden = (id: PermissionId) =>
		value?.[id] !== undefined &&
		!!value[id] !== hasPermission(basePermissions, id);

	/**
	 * Writes permissions, dropping any explicit value that doesn't change the result
	 * so `value` only ever holds real overrides. Heading flags are cleaned first,
	 * since whether an individual permission's value is redundant depends on them.
	 */
	const commit = (next: PermissionsObject) => {
		const cleaned = { ...next };
		const keys = Object.keys(cleaned) as (PermissionId | PermissionGroupId)[];
		for (const key of keys) {
			if (!isPermissionId(key) && !!cleaned[key] === !!basePermissions[key]) {
				delete cleaned[key];
			}
		}
		for (const key of keys.filter(isPermissionId)) {
			const withoutKey = { ...cleaned };
			delete withoutKey[key];
			const inherited = hasPermission(
				{ ...basePermissions, ...withoutKey },
				key,
			);
			if (inherited === !!cleaned[key]) {
				delete cleaned[key];
			}
		}
		onChange(cleaned);
	};

	const resetOverride = (id: PermissionId) => {
		const next = { ...value };
		delete next[id];
		onChange(next);
	};

	const subgroupPermissionIds = (
		subgroupPermissions: readonly PermissionEntry[],
	): PermissionId[] => subgroupPermissions.map((p) => p.id as PermissionId);

	const subgroupHasOverride = (
		groupId: PermissionGroupId,
		subgroupPermissions: readonly PermissionEntry[],
	) =>
		value?.[groupId] !== undefined ||
		subgroupPermissionIds(subgroupPermissions).some((id) => isOverridden(id));

	const resetSubgroupOverrides = (
		groupId: PermissionGroupId,
		subgroupPermissions: readonly PermissionEntry[],
	) => {
		const next = { ...value };
		delete next[groupId];
		for (const id of subgroupPermissionIds(subgroupPermissions)) {
			delete next[id];
		}
		onChange(next);
	};

	/** Checked when the heading's "all" flag is on, indeterminate when only some of its permissions are. */
	const getGroupState = (
		groupId: PermissionGroupId,
		groupPermissions: readonly PermissionEntry[],
	) => {
		if (effective[groupId]) return true;
		const anyChecked = groupPermissions
			.filter((p) => !p.parent)
			.some((p) => hasPermission(effective, p.id as PermissionId));
		return anyChecked ? "indeterminate" : false;
	};

	/**
	 * Toggles the heading's "all" flag and sets every permission under it to match,
	 * except locked ones, which keep their current state.
	 */
	const toggleGroup = (
		groupId: PermissionGroupId,
		groupPermissions: readonly PermissionEntry[],
	) => {
		const turnOn = !effective[groupId];
		const next: PermissionsObject = { ...value, [groupId]: turnOn };
		for (const id of subgroupPermissionIds(groupPermissions)) {
			next[id] = isPermissionDisabled(id)
				? hasPermission(effective, id)
				: turnOn;
		}
		commit(next);
	};

	const categoryEntries = Object.entries(PERMISSIONS).map(
		([categoryKey, category]) => {
			const categoryMatches = titleMatches(category.title);
			const subgroupEntries = Object.entries(category.subgroups).map(
				([subgroupKey, subgroup]) => {
					const subgroupMatches = titleMatches(subgroup.title);
					const showAllInSubgroup =
						!hasQuery || categoryMatches || subgroupMatches;
					const topLevelPerms = subgroup.permissions.filter(
						(p: PermissionEntry) => !p.parent,
					);
					const visibleTopLevelPerms = showAllInSubgroup
						? topLevelPerms
						: topLevelPerms.filter((p: PermissionEntry) => {
								const subs = subgroup.permissions.filter(
									(s: PermissionEntry) => s.parent === p.id,
								);
								return (
									titleMatches(p.title) ||
									subs.some((s: PermissionEntry) => titleMatches(s.title))
								);
							});
					return {
						subgroupKey,
						subgroup,
						showAllInSubgroup,
						visibleTopLevelPerms,
						visible: showAllInSubgroup || visibleTopLevelPerms.length > 0,
					};
				},
			);
			return {
				categoryKey,
				category,
				subgroupEntries,
				visible: !hasQuery || subgroupEntries.some((s) => s.visible),
			};
		},
	);

	const openItems = hasQuery
		? categoryEntries.filter((c) => c.visible).map((c) => c.categoryKey)
		: manualOpenItems;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between border-b pb-2">
				<span className="font-bold text-lg">Permissions</span>
			</div>

			<div className="relative">
				<Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-8"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search permissions..."
					value={query}
				/>
			</div>

			{hasQuery && categoryEntries.every((c) => !c.visible) && (
				<p className="py-2 text-muted-foreground text-sm">
					No permissions match "{query}".
				</p>
			)}

			<Accordion
				className="rounded-md border"
				onValueChange={(v) => {
					if (!hasQuery) setManualOpenItems(v);
				}}
				type="multiple"
				value={openItems}
			>
				{categoryEntries
					.filter((c) => c.visible)
					.map(({ categoryKey, category, subgroupEntries }) => (
						<AccordionItem key={categoryKey} value={categoryKey}>
							<AccordionTrigger className="px-4 font-semibold text-base hover:no-underline">
								{category.title}
							</AccordionTrigger>
							<AccordionContent className="px-4 pt-2 pb-4">
								<div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
									{subgroupEntries
										.filter((s) => s.visible)
										.map(
											({
												subgroupKey,
												subgroup,
												showAllInSubgroup,
												visibleTopLevelPerms,
											}) => {
												const groupId = permissionGroupId(
													categoryKey,
													subgroupKey,
												);
												const groupState = getGroupState(
													groupId,
													subgroup.permissions,
												);
												return (
													<div key={subgroupKey}>
														<div className="mb-3 flex items-center space-x-2">
															<Checkbox
																checked={groupState}
																disabled={disabled}
																id={`${categoryKey}-${subgroupKey}`}
																onCheckedChange={() =>
																	toggleGroup(groupId, subgroup.permissions)
																}
															/>
															<FormLabel
																className="font-semibold text-md"
																htmlFor={`${categoryKey}-${subgroupKey}`}
															>
																{subgroup.title}
															</FormLabel>
															{groupState === true && (
																<span className="text-muted-foreground text-xs">
																	All, including new permissions
																</span>
															)}
															{showOverrides &&
																subgroupHasOverride(
																	groupId,
																	subgroup.permissions,
																) && (
																	<Button
																		className="h-6 px-2 font-normal text-xs"
																		disabled={disabled}
																		onClick={() =>
																			resetSubgroupOverrides(
																				groupId,
																				subgroup.permissions,
																			)
																		}
																		size="sm"
																		type="button"
																		variant="outline"
																	>
																		Reset to role default
																	</Button>
																)}
														</div>

														<div className="ml-8 space-y-2">
															{visibleTopLevelPerms.map(
																(p: PermissionEntry) => {
																	const pid = p.id as PermissionId;
																	const allSubs = subgroup.permissions.filter(
																		(s: PermissionEntry) => s.parent === p.id,
																	);
																	const subs =
																		showAllInSubgroup || titleMatches(p.title)
																			? allSubs
																			: allSubs.filter((s: PermissionEntry) =>
																					titleMatches(s.title),
																				);
																	const locked = isPermissionDisabled(p.id);
																	return (
																		<div key={p.id}>
																			<div className="flex items-center space-x-2">
																				{locked ? (
																					<TooltipProvider>
																						<Tooltip>
																							<TooltipTrigger asChild>
																								<span className="cursor-not-allowed">
																									<Checkbox
																										checked={hasPermission(
																											effective,
																											pid,
																										)}
																										disabled
																										id={p.id}
																									/>
																								</span>
																							</TooltipTrigger>
																							<TooltipContent>
																								You can't remove your own
																								user-management permission
																							</TooltipContent>
																						</Tooltip>
																					</TooltipProvider>
																				) : (
																					<Checkbox
																						checked={hasPermission(
																							effective,
																							pid,
																						)}
																						disabled={disabled}
																						id={p.id}
																						onCheckedChange={(checked) => {
																							const next = {
																								...value,
																								[pid]: !!checked,
																							};
																							if (!checked) {
																								for (const sub of allSubs) {
																									next[sub.id as PermissionId] =
																										false;
																								}
																							}
																							commit(next);
																						}}
																					/>
																				)}
																				<FormLabel htmlFor={p.id}>
																					{p.title}
																				</FormLabel>
																				{showOverrides &&
																					!locked &&
																					isOverridden(pid) && (
																						<Button
																							className="h-5 gap-1 px-1.5 font-normal text-muted-foreground text-xs"
																							disabled={disabled}
																							onClick={() => resetOverride(pid)}
																							size="sm"
																							title="Reset to role default"
																							type="button"
																							variant="ghost"
																						>
																							(role default:{" "}
																							{hasPermission(
																								basePermissions,
																								pid,
																							)
																								? "on"
																								: "off"}
																							)
																							<X className="h-3 w-3" />
																						</Button>
																					)}
																			</div>

																			{subs.length > 0 && (
																				<div className="mt-1 ml-6 space-y-1">
																					{subs.map((sub: PermissionEntry) => (
																						<div
																							className="flex items-center space-x-2"
																							key={sub.id}
																						>
																							<Checkbox
																								checked={hasPermission(
																									effective,
																									sub.id as PermissionId,
																								)}
																								disabled={
																									disabled ||
																									!hasPermission(effective, pid)
																								}
																								id={sub.id}
																								onCheckedChange={(checked) =>
																									commit({
																										...value,
																										[sub.id as PermissionId]:
																											!!checked,
																									})
																								}
																							/>
																							<FormLabel
																								className="font-normal"
																								htmlFor={sub.id}
																							>
																								{sub.title}
																							</FormLabel>
																							{showOverrides &&
																								!locked &&
																								isOverridden(
																									sub.id as PermissionId,
																								) && (
																									<Button
																										className="h-5 gap-1 px-1.5 font-normal text-muted-foreground text-xs"
																										disabled={disabled}
																										onClick={() =>
																											resetOverride(
																												sub.id as PermissionId,
																											)
																										}
																										size="sm"
																										title="Reset to role default"
																										type="button"
																										variant="ghost"
																									>
																										(role default:{" "}
																										{hasPermission(
																											basePermissions,
																											sub.id as PermissionId,
																										)
																											? "on"
																											: "off"}
																										)
																										<X className="h-3 w-3" />
																									</Button>
																								)}
																						</div>
																					))}
																				</div>
																			)}
																		</div>
																	);
																},
															)}
														</div>
													</div>
												);
											},
										)}
								</div>
							</AccordionContent>
						</AccordionItem>
					))}
			</Accordion>
		</div>
	);
}
