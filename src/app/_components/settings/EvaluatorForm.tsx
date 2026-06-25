"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import MultipleSelector from "@ui/multiple-selector";
import { Switch } from "@ui/switch";
import { type ReactNode, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Evaluator } from "~/lib/models";
import { api } from "~/trpc/react";

export const evaluatorFormSchema = z.object({
	npi: z.string().length(10, {
		message: "NPI must be exactly 10 digits.",
	}),
	providerName: z.string().min(1, { message: "Provider name is required." }),
	email: z.email(),
	outOfOfficePriority: z.boolean(),
	insurances: z.array(z.number()),
	offices: z.array(z.string()),
	blockedDistricts: z.array(z.number()),
	blockedZips: z.array(
		z.string().regex(/^\d{5}$/, "Must be a 5-digit zip code"),
	),
	appointmentDurations: z.record(z.string(), z.number().nonnegative().int()),
	allowedAppointmentTypes: z.array(z.string()),
	writesOwnReports: z.boolean(),
});

export type EvaluatorFormValues = z.infer<typeof evaluatorFormSchema>;

const DIAG_KEYS = ["ASD", "ADHD", "ASD+LD", "ADHD+LD", "LD"] as const;

const EVAL_AGE_VARIANTS = [
	{ suffix: "/young", label: " (≤6)" },
	{ suffix: "/older", label: " (7+)" },
] as const;

function expandAllowedTypes(types: string[]): string[] {
	const expanded = new Set<string>();
	for (const t of types) {
		if (t === "DA") {
			expanded.add("DA");
			for (const d of DIAG_KEYS) expanded.add(`DA/${d}`);
		} else if (t === "EVAL") {
			expanded.add("EVAL");
			for (const d of DIAG_KEYS) expanded.add(`EVAL/${d}`);
		} else if (t === "DAEVAL") {
			expanded.add("DAEVAL");
			for (const d of DIAG_KEYS) expanded.add(`DAEVAL/${d}`);
		} else {
			expanded.add(t);
		}
	}
	return [...expanded];
}

interface EvaluatorFormProps {
	initialData?: Evaluator;
	initialEmail?: string;
	onSubmit: (values: EvaluatorFormValues) => void;
	isLoading: boolean;
	onClose?: () => void;
	disabled?: boolean;
	archiveButton?: ReactNode;
}

export function EvaluatorForm({
	initialData,
	initialEmail,
	onSubmit,
	isLoading,
	onClose,
	disabled = false,
	archiveButton,
}: EvaluatorFormProps) {
	const isEditing = !!initialData;

	const { data: allOffices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();
	const { data: allZipCodes, isLoading: isLoadingZipCodes } =
		api.evaluators.getAllZipCodes.useQuery();
	const { data: allSchoolDistricts, isLoading: isLoadingSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();
	const { data: allInsurances, isLoading: isLoadingInsurances } =
		api.insurances.getAll.useQuery();
	const { data: globalDefaults } = api.workSummary.getDefaults.useQuery();

	const zipCodeOptions = useMemo(() => {
		if (!allZipCodes) return [];
		return allZipCodes.map((zip) => ({ label: zip.zip, value: zip.zip }));
	}, [allZipCodes]);

	const districtOptions = useMemo(() => {
		return (
			allSchoolDistricts?.map((district) => ({
				value: district.id.toString(),
				label: district.shortName || district.fullName,
			})) ?? []
		);
	}, [allSchoolDistricts]);

	const defaultValues = useMemo(() => {
		if (initialData) {
			return {
				npi: initialData.npi.toString(),
				providerName: initialData.providerName,
				email: initialData.email,
				outOfOfficePriority: initialData.outOfOfficePriority,
				insurances: initialData.insurances.map((i) => i.id),
				offices: initialData.offices.map((office) => office.key),
				blockedDistricts: initialData?.blockedDistricts?.map((d) => d.id) ?? [],
				blockedZips: initialData?.blockedZips?.map((z) => z.zip) ?? [],
				appointmentDurations:
					(initialData.appointmentDurations as Record<string, number>) ?? {},
				allowedAppointmentTypes: expandAllowedTypes(
					(initialData.allowedAppointmentTypes as string[]) ?? [
						"DA",
						"EVAL",
						"DAEVAL",
					],
				),
				writesOwnReports: initialData.writesOwnReports ?? false,
			};
		}
		return {
			npi: "",
			providerName: "",
			email: initialEmail ?? "",
			outOfOfficePriority: false,
			insurances: [],
			offices: [],
			blockedDistricts: [],
			blockedZips: [],
			appointmentDurations: {},
			allowedAppointmentTypes: expandAllowedTypes(["DA", "EVAL", "DAEVAL"]),
			writesOwnReports: false,
		};
	}, [initialData, initialEmail]);

	const form = useForm<EvaluatorFormValues>({
		resolver: zodResolver(evaluatorFormSchema),
		defaultValues,
	});

	const durations = form.watch("appointmentDurations") ?? {};
	const allowedTypes = form.watch("allowedAppointmentTypes") ?? [
		"DA",
		"EVAL",
		"DAEVAL",
	];

	function getDuration(key: string): string {
		const val = durations[key];
		return val !== undefined ? String(val / 60) : "";
	}

	function getDefaultPlaceholder(key: string): string {
		const val = globalDefaults?.[key];
		return val !== undefined ? String(val / 60) : "—";
	}

	function setDuration(key: string, raw: string) {
		const current = { ...(form.getValues("appointmentDurations") ?? {}) };
		const hrs = parseFloat(raw);
		if (!raw || Number.isNaN(hrs) || hrs < 0) {
			delete current[key];
		} else {
			current[key] = Math.round(hrs * 60);
		}
		form.setValue("appointmentDurations", current, { shouldDirty: true });
	}

	const dInput = (key: string) => {
		const parts = key.split("/");
		const baseType = parts[0] ?? key;
		const diag =
			parts[1] && parts[1] !== "young" && parts[1] !== "older"
				? parts[1]
				: null;
		const typeKey = diag ? `${baseType}/${diag}` : baseType;
		const isDisabled =
			disabled ||
			isLoading ||
			(baseType !== "default" &&
				!allowedTypes.includes(typeKey) &&
				!allowedTypes.includes(baseType));
		return (
			<Input
				className="h-8 text-center text-sm"
				disabled={isDisabled}
				inputMode="decimal"
				onChange={(e) => setDuration(key, e.target.value)}
				placeholder={getDefaultPlaceholder(key)}
				type="text"
				value={getDuration(key)}
			/>
		);
	};

	return (
		<Form {...form}>
			<form
				className="space-y-6"
				onSubmit={form.handleSubmit((values) => {
					const cleaned = Object.fromEntries(
						Object.entries(values.appointmentDurations).filter(
							([k]) =>
								!k.startsWith("DA/") &&
								!k.startsWith("default") &&
								!k.includes("ASD+ADHD") &&
								k !== "EVAL" &&
								k !== "DAEVAL",
						),
					);
					onSubmit({ ...values, appointmentDurations: cleaned });
				})}
			>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="npi"
						render={({ field }) => (
							<FormItem>
								<FormLabel>NPI</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading || isEditing || disabled}
										placeholder="1234567890"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="providerName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Provider Name</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading || disabled}
										placeholder="Jane Doe"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex items-center gap-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem className="w-full">
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading || isEditing || disabled}
										placeholder="evaluator@domain.com"
										type="email"
										{...field}
									/>
								</FormControl>
								{isEditing && (
									<FormDescription>
										Email is set at creation and cannot be changed.
									</FormDescription>
								)}
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="outOfOfficePriority"
						render={({ field }) => (
							<FormItem className="flex flex-col gap-2">
								<FormLabel>Out of Office Priority</FormLabel>
								<FormDescription>
									This evaluator tells us their out of office times, not their
									in office times.
								</FormDescription>
								<FormControl>
									<Switch
										checked={field.value}
										disabled={isLoading || disabled}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="writesOwnReports"
						render={({ field }) => (
							<FormItem className="flex flex-col gap-2">
								<FormLabel>Writes Own Reports</FormLabel>
								<FormDescription>
									If the punchlist writer is blank, credit this evaluator for
									report piecework based on their most recent 96136 appointment.
								</FormDescription>
								<FormControl>
									<Switch
										checked={field.value}
										disabled={isLoading || disabled}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="space-y-2">
					<FormLabel>Insurance</FormLabel>
					<div className="grid grid-cols-2 gap-4 rounded-md border p-4 sm:grid-cols-3">
						{isLoadingInsurances ? (
							<p>Loading insurances...</p>
						) : (
							allInsurances?.map((insurance) => (
								<FormField
									control={form.control}
									key={insurance.id}
									name="insurances"
									render={({ field }) => (
										<FormItem className="flex items-center space-x-2 space-y-0">
											<FormControl>
												<Checkbox
													checked={field.value?.includes(insurance.id)}
													disabled={isLoading || disabled}
													onCheckedChange={(checked) => {
														return checked
															? field.onChange([...field.value, insurance.id])
															: field.onChange(
																	field.value?.filter(
																		(value: number) => value !== insurance.id,
																	),
																);
													}}
												/>
											</FormControl>
											<FormLabel className="font-normal">
												{insurance.shortName}
											</FormLabel>
										</FormItem>
									)}
								/>
							))
						)}
					</div>
				</div>

				<FormField
					control={form.control}
					name="offices"
					render={({ field: _ }) => (
						<FormItem>
							<FormLabel>Offices</FormLabel>
							<div className="flex justify-between gap-4 rounded-md border p-4 sm:justify-center">
								{isLoadingOffices ? (
									<p>Loading offices...</p>
								) : (
									allOffices?.map((office) => (
										<FormField
											control={form.control}
											key={office.key}
											name="offices"
											render={({ field }) => {
												return (
													<FormItem
														className="flex items-center"
														key={office.key}
													>
														<FormControl>
															<Checkbox
																checked={field.value?.includes(office.key)}
																disabled={isLoading || disabled}
																onCheckedChange={(checked) => {
																	return checked
																		? field.onChange([
																				...field.value,
																				office.key,
																			])
																		: field.onChange(
																				field.value?.filter(
																					(value) => value !== office.key,
																				),
																			);
																}}
															/>
														</FormControl>
														<FormLabel className="hidden font-normal sm:block">
															{office.prettyName}
														</FormLabel>
														<FormLabel className="font-normal sm:hidden">
															{office.key}
														</FormLabel>
													</FormItem>
												);
											}}
										/>
									))
								)}
							</div>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="blockedDistricts"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blocked School Districts</FormLabel>
							<FormControl>
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									disabled={isLoading || disabled}
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No districts found.
										</p>
									}
									loadingIndicator={
										isLoadingSchoolDistricts ? (
											<p className="text-center text-muted-foreground text-sm">
												Loading districts...
											</p>
										) : undefined
									}
									onChange={(options) =>
										field.onChange(options.map((opt) => Number(opt.value)))
									}
									options={districtOptions}
									placeholder="Select districts..."
									value={districtOptions.filter((option) =>
										field.value.includes(Number(option.value)),
									)}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="blockedZips"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blocked Zip Codes</FormLabel>
							<FormControl>
								{/* BUG: This doesn't take keyboard tab focus properly */}
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									creatable={true}
									defaultOptions={zipCodeOptions}
									disabled={isLoading || disabled}
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No zip codes found. Type to create a new one.
										</p>
									}
									loadingIndicator={
										isLoadingZipCodes ? (
											<p className="text-center text-muted-foreground text-sm">
												Loading zips...
											</p>
										) : undefined
									}
									onChange={(options) =>
										field.onChange(options.map((opt) => opt.value))
									}
									placeholder="Select zip codes..."
									value={field.value.map((zip) => ({
										label: zip,
										value: zip,
									}))}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="allowedAppointmentTypes"
					render={({ field }) => {
						function toggle(key: string, checked: boolean) {
							const isRowKey = !key.includes("/");
							if (checked) {
								if (isRowKey) {
									// Checking "Any" enables all subtypes
									const toAdd = [key, ...DIAG_KEYS.map((d) => `${key}/${d}`)];
									field.onChange([
										...field.value.filter((t) => !toAdd.includes(t)),
										...toAdd,
									]);
								} else {
									// Checking a subtype — also check "Any" if all subtypes now checked
									const baseType = key.split("/")[0] ?? key;
									const next = [...field.value.filter((t) => t !== key), key];
									const allChecked = DIAG_KEYS.every((d) =>
										next.includes(`${baseType}/${d}`),
									);
									if (allChecked && !next.includes(baseType))
										next.push(baseType);
									field.onChange(next);
								}
							} else {
								if (isRowKey) {
									// Unchecking "Any" removes all subtypes
									const toRemove = new Set([
										key,
										...DIAG_KEYS.map((d) => `${key}/${d}`),
									]);
									field.onChange(field.value.filter((t) => !toRemove.has(t)));
								} else {
									// Unchecking a subtype also removes "Any"
									const baseType = key.split("/")[0] ?? key;
									field.onChange(
										field.value.filter((t) => t !== key && t !== baseType),
									);
								}
							}
						}
						function isChecked(key: string) {
							return field.value.includes(key);
						}
						function cb(key: string) {
							return (
								<Checkbox
									checked={isChecked(key)}
									disabled={isLoading || disabled}
									onCheckedChange={(c) => toggle(key, !!c)}
								/>
							);
						}
						return (
							<FormItem>
								<FormLabel>Allowed Appointment Types</FormLabel>
								<div className="overflow-x-auto rounded-md border p-3">
									<div className="grid min-w-[600px] grid-cols-7 items-center gap-x-2 gap-y-2 text-sm">
										{/* Column headers */}
										<div />
										<div className="text-center font-medium text-muted-foreground text-xs">
											Any
										</div>
										{DIAG_KEYS.map((d) => (
											<div
												className="text-center font-medium text-muted-foreground text-xs"
												key={d}
											>
												{d}
											</div>
										))}
										{/* DA, EVAL, DAEVAL rows */}
										{(["DA", "EVAL", "DAEVAL"] as const).map((type) => (
											<>
												<div className="font-medium" key={`${type}-label`}>
													{type}
												</div>
												<div className="flex justify-center">{cb(type)}</div>
												{DIAG_KEYS.map((d) => (
													<div
														className="flex justify-center"
														key={`${type}/${d}`}
													>
														{cb(`${type}/${d}`)}
													</div>
												))}
											</>
										))}
									</div>
								</div>
							</FormItem>
						);
					}}
				/>

				<div className="space-y-2">
					<FormLabel>Appointment Durations (hours)</FormLabel>
					<div className="overflow-x-auto rounded-md border p-3">
						<div className="grid min-w-[600px] grid-cols-7 items-center gap-x-2 gap-y-2 text-sm">
							{/* Column headers */}
							<div />
							<div className="text-center font-medium text-muted-foreground text-xs">
								(any)
							</div>
							{DIAG_KEYS.map((d) => (
								<div
									className="text-center font-medium text-muted-foreground text-xs"
									key={d}
								>
									{d}
								</div>
							))}

							{/* DA: no age or diagnosis subcategories */}
							<div className="font-medium">DA</div>
							{dInput("DA")}
							{DIAG_KEYS.map((d) => (
								<div key={`da-empty-${d}`} />
							))}

							{/* EVAL and DAEVAL: age-specific rows only */}
							{(["EVAL", "DAEVAL"] as const).map((type) =>
								EVAL_AGE_VARIANTS.map(({ suffix, label }) => (
									<>
										<div className="font-medium" key={`${type}-label${suffix}`}>
											{type}
											{label}
										</div>
										{dInput(`${type}${suffix}`)}
										{DIAG_KEYS.map((d) => (
											<span key={`${type}/${d}${suffix}`}>
												{dInput(`${type}/${d}${suffix}`)}
											</span>
										))}
									</>
								)),
							)}
						</div>
					</div>
					<p className="text-muted-foreground text-xs">
						Diagnosis subtypes override the age-only row, which overrides
						Default. DA is a flat rate with no subcategories. Grayed-out
						placeholders show the global default. Leave blank to fall back to
						the default. Disabled rows reflect types this evaluator cannot
						perform. Values are in hours (e.g. 1.5 = 90 min).
					</p>
				</div>

				<div className="flex items-center justify-between pt-4">
					{archiveButton ?? <div />}
					<div className="flex gap-2">
						{onClose && (
							<Button onClick={onClose} type="button" variant="ghost">
								Cancel
							</Button>
						)}
						<Button disabled={isLoading || disabled} type="submit">
							{isLoading
								? "Saving..."
								: isEditing
									? "Save Evaluator"
									: "Create Evaluator"}
						</Button>
					</div>
				</div>
			</form>
		</Form>
	);
}
