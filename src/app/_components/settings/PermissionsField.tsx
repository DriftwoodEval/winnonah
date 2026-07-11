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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { X } from "lucide-react";
import { PERMISSIONS } from "~/lib/constants";
import type { PermissionId, PermissionsObject } from "~/lib/types";

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
	const effective: PermissionsObject = { ...basePermissions, ...value };
	const showOverrides = Object.keys(basePermissions).length > 0;

	const isOverridden = (id: PermissionId) =>
		value?.[id] !== undefined && !!value[id] !== !!basePermissions?.[id];

	/** Writes permissions, dropping any explicit value that just repeats the role default so `value` only ever holds real overrides. */
	const commit = (next: PermissionsObject) => {
		const cleaned = { ...next };
		for (const key of Object.keys(cleaned) as PermissionId[]) {
			if (!!cleaned[key] === !!basePermissions?.[key]) {
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
		subgroupPermissions: readonly { id: string }[],
	): PermissionId[] => subgroupPermissions.map((p) => p.id as PermissionId);

	const subgroupHasOverride = (
		subgroupPermissions: readonly { id: string }[],
	) =>
		subgroupPermissionIds(subgroupPermissions).some((id) => isOverridden(id));

	const resetSubgroupOverrides = (
		subgroupPermissions: readonly { id: string }[],
	) => {
		const next = { ...value };
		for (const id of subgroupPermissionIds(subgroupPermissions)) {
			delete next[id];
		}
		onChange(next);
	};

	const getGroupState = (
		groupPermissions: readonly {
			id: string;
			title: string;
			parent?: string;
		}[],
	) => {
		const topLevel = groupPermissions.filter((p) => !p.parent);
		const allChecked = topLevel.every((p) => effective?.[p.id as PermissionId]);
		const anyChecked = topLevel.some((p) => effective?.[p.id as PermissionId]);
		if (allChecked) return true;
		if (anyChecked) return "indeterminate";
		return false;
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between border-b pb-2">
				<span className="font-bold text-lg">Permissions</span>
			</div>

			<Accordion className="rounded-md border" type="multiple">
				{Object.entries(PERMISSIONS).map(([categoryKey, category]) => (
					<AccordionItem key={categoryKey} value={categoryKey}>
						<AccordionTrigger className="px-4 font-semibold text-base hover:no-underline">
							{category.title}
						</AccordionTrigger>
						<AccordionContent className="px-4 pt-2 pb-4">
							<div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
								{Object.entries(category.subgroups).map(
									([subgroupKey, subgroup]) => {
										const groupState = getGroupState(subgroup.permissions);
										return (
											<div key={subgroupKey}>
												<div className="mb-3 flex items-center space-x-2">
													<Checkbox
														checked={groupState}
														disabled={disabled}
														id={`${categoryKey}-${subgroupKey}`}
														onCheckedChange={() => {
															const newChecked = groupState === false;
															const next = { ...value };
															for (const p of subgroup.permissions as {
																id: string;
																title: string;
																parent?: string;
															}[]) {
																if (!isPermissionDisabled(p.id)) {
																	next[p.id as PermissionId] = newChecked;
																}
															}
															commit(next);
														}}
													/>
													<FormLabel
														className="font-semibold text-md"
														htmlFor={`${categoryKey}-${subgroupKey}`}
													>
														{subgroup.title}
													</FormLabel>
													{showOverrides &&
														subgroupHasOverride(subgroup.permissions) && (
															<Button
																className="h-6 px-2 font-normal text-xs"
																disabled={disabled}
																onClick={() =>
																	resetSubgroupOverrides(subgroup.permissions)
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
													{subgroup.permissions
														.filter(
															(p: {
																id: string;
																title: string;
																parent?: string;
															}) => !p.parent,
														)
														.map(
															(p: {
																id: string;
																title: string;
																parent?: string;
															}) => {
																const pid = p.id as PermissionId;
																const subs = subgroup.permissions.filter(
																	(s: {
																		id: string;
																		title: string;
																		parent?: string;
																	}) => s.parent === p.id,
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
																									checked={!!effective?.[pid]}
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
																					checked={!!effective?.[pid]}
																					disabled={disabled}
																					id={p.id}
																					onCheckedChange={(checked) => {
																						const next = {
																							...value,
																							[pid]: !!checked,
																						};
																						if (!checked) {
																							for (const sub of subs) {
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
																						{basePermissions?.[pid]
																							? "on"
																							: "off"}
																						)
																						<X className="h-3 w-3" />
																					</Button>
																				)}
																		</div>

																		{subs.length > 0 && (
																			<div className="mt-1 ml-6 space-y-1">
																				{subs.map(
																					(sub: {
																						id: string;
																						title: string;
																						parent?: string;
																					}) => (
																						<div
																							className="flex items-center space-x-2"
																							key={sub.id}
																						>
																							<Checkbox
																								checked={
																									!!effective?.[
																										sub.id as PermissionId
																									]
																								}
																								disabled={
																									disabled || !effective?.[pid]
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
																										{basePermissions?.[
																											sub.id as PermissionId
																										]
																											? "on"
																											: "off"}
																										)
																										<X className="h-3 w-3" />
																									</Button>
																								)}
																						</div>
																					),
																				)}
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
