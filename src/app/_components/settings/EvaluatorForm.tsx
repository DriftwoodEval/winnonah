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
	allowedAppointmentTypes: z.array(z.enum(["DA", "EVAL", "DAEVAL"])),
	writesOwnReports: z.boolean(),
});

export type EvaluatorFormValues = z.infer<typeof evaluatorFormSchema>;

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
				allowedAppointmentTypes: (initialData.allowedAppointmentTypes ?? [
					"DA",
					"EVAL",
					"DAEVAL",
				]) as ("DA" | "EVAL" | "DAEVAL")[],
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
			allowedAppointmentTypes: ["DA", "EVAL", "DAEVAL"] as (
				| "DA"
				| "EVAL"
				| "DAEVAL"
			)[],
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

	const DIAG_COLS = [
		{ key: "ASD" },
		{ key: "ADHD" },
		{ key: "ASD+ADHD" },
		{ key: "ASD+LD" },
		{ key: "ADHD+LD" },
		{ key: "LD" },
	] as const;

	const AGE_VARIANTS = [
		{ suffix: "", label: "" },
		{ suffix: "/young", label: " (≤6)" },
		{ suffix: "/older", label: " (7+)" },
	] as const;

	const APPT_TYPES = ["DA", "EVAL", "DAEVAL"] as const;

	function getDuration(key: string): string {
		const val = durations[key];
		return val !== undefined ? String(val / 60) : "";
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
		const baseType = key.split("/")[0] ?? key;
		const isDisabled =
			disabled ||
			isLoading ||
			(baseType !== "default" &&
				!allowedTypes.includes(baseType as "DA" | "EVAL" | "DAEVAL"));
		return (
			<Input
				className="h-8 text-center text-sm"
				disabled={isDisabled}
				min="0"
				onChange={(e) => setDuration(key, e.target.value)}
				placeholder="—"
				step="0.5"
				type="number"
				value={getDuration(key)}
			/>
		);
	};

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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
					render={({ field }) => (
						<FormItem>
							<FormLabel>Allowed Appointment Types</FormLabel>
							<div className="flex gap-4">
								{(["DA", "EVAL", "DAEVAL"] as const).map((type) => (
									<FormItem
										className="flex items-center gap-2 space-y-0"
										key={type}
									>
										<FormControl>
											<Checkbox
												checked={field.value.includes(type)}
												disabled={isLoading || disabled}
												onCheckedChange={(checked) => {
													if (checked) {
														field.onChange([...field.value, type]);
													} else {
														field.onChange(
															field.value.filter((t) => t !== type),
														);
													}
												}}
											/>
										</FormControl>
										<FormLabel className="font-normal">{type}</FormLabel>
									</FormItem>
								))}
							</div>
						</FormItem>
					)}
				/>

				<div className="space-y-2">
					<FormLabel>Appointment Durations (hours)</FormLabel>
					<div className="overflow-x-auto rounded-md border p-3">
						<div className="grid min-w-[600px] grid-cols-8 items-center gap-x-2 gap-y-2 text-sm">
							{/* Column headers */}
							<div />
							<div className="text-center font-medium text-muted-foreground text-xs">
								(any)
							</div>
							{DIAG_COLS.map((d) => (
								<div
									className="text-center font-medium text-muted-foreground text-xs"
									key={d.key}
								>
									{d.key}
								</div>
							))}

							{/* Default rows */}
							{AGE_VARIANTS.map(({ suffix, label }) => (
								<>
									<div className="font-medium" key={`default-label${suffix}`}>
										Default{label}
									</div>
									{dInput(`default${suffix}`)}
									{DIAG_COLS.map((d) => (
										<div key={`default${suffix}-${d.key}`} />
									))}
								</>
							))}

							{/* Appointment type rows */}
							{APPT_TYPES.map((type) =>
								AGE_VARIANTS.map(({ suffix, label }) => (
									<>
										<div className="font-medium" key={`${type}-label${suffix}`}>
											{type}
											{label}
										</div>
										{dInput(`${type}${suffix}`)}
										{DIAG_COLS.map((d) => (
											<span key={`${type}/${d.key}${suffix}`}>
												{dInput(`${type}/${d.key}${suffix}`)}
											</span>
										))}
									</>
								)),
							)}
						</div>
					</div>
					<p className="text-muted-foreground text-xs">
						Specific subtypes override DA/EVAL/DAEVAL, which override Default.
						Age-specific rows override the age-agnostic rows. Disabled rows
						reflect types this evaluator cannot perform. Values are in hours
						(e.g. 1.5 = 90 min).
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
									? "Save Changes"
									: "Create Evaluator"}
						</Button>
					</div>
				</div>
			</form>
		</Form>
	);
}
