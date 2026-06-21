"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Checkbox } from "@ui/checkbox";
import { FormLabel } from "@ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { PERMISSIONS } from "~/lib/constants";
import {
	type PermissionId,
	type PermissionsObject,
	permissionPresets,
} from "~/lib/types";

interface PermissionsFieldProps {
	value: PermissionsObject;
	onChange: (permissions: PermissionsObject) => void;
	disabled?: boolean;
	isPermissionDisabled?: (id: string) => boolean;
}

export function PermissionsField({
	value,
	onChange,
	disabled = false,
	isPermissionDisabled = () => false,
}: PermissionsFieldProps) {
	const getGroupState = (
		groupPermissions: readonly {
			id: string;
			title: string;
			parent?: string;
		}[],
	) => {
		const topLevel = groupPermissions.filter((p) => !p.parent);
		const allChecked = topLevel.every((p) => value?.[p.id as PermissionId]);
		const anyChecked = topLevel.some((p) => value?.[p.id as PermissionId]);
		if (allChecked) return true;
		if (anyChecked) return "indeterminate";
		return false;
	};

	const handlePresetChange = (presetValue: string) => {
		const preset = permissionPresets.find((p) => p.value === presetValue);
		if (!preset) return;
		const next = { ...preset.permissions };
		for (const id of Object.keys(value) as PermissionId[]) {
			if (isPermissionDisabled(id)) next[id] = value[id] ?? false;
		}
		onChange(next);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between border-b pb-2">
				<span className="font-bold text-lg">Permissions</span>
				<Select disabled={disabled} onValueChange={handlePresetChange}>
					<SelectTrigger className="w-auto" size="sm">
						<SelectValue placeholder="Select a preset..." />
					</SelectTrigger>
					<SelectContent>
						{permissionPresets.map((preset) => (
							<SelectItem key={preset.value} value={preset.value}>
								{preset.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
															onChange(next);
														}}
													/>
													<FormLabel
														className="font-semibold text-md"
														htmlFor={`${categoryKey}-${subgroupKey}`}
													>
														{subgroup.title}
													</FormLabel>
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
																									checked={!!value?.[pid]}
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
																					checked={!!value?.[pid]}
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
																						onChange(next);
																					}}
																				/>
																			)}
																			<FormLabel htmlFor={p.id}>
																				{p.title}
																			</FormLabel>
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
																									!!value?.[
																										sub.id as PermissionId
																									]
																								}
																								disabled={
																									disabled || !value?.[pid]
																								}
																								id={sub.id}
																								onCheckedChange={(checked) =>
																									onChange({
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
