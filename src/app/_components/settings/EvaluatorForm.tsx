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
import { useMemo } from "react";
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
});

export type EvaluatorFormValues = z.infer<typeof evaluatorFormSchema>;

interface EvaluatorFormProps {
	initialData?: Evaluator;
	initialEmail?: string;
	onSubmit: (values: EvaluatorFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

export function EvaluatorForm({
	initialData,
	initialEmail,
	onSubmit,
	isLoading,
	onClose,
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
		};
	}, [initialData, initialEmail]);

	const form = useForm<EvaluatorFormValues>({
		resolver: zodResolver(evaluatorFormSchema),
		defaultValues,
	});

	const durations = form.watch("appointmentDurations") ?? {};

	function getDuration(key: string): string {
		const val = durations[key];
		return val !== undefined ? String(val) : "";
	}

	function setDuration(key: string, raw: string) {
		const current = { ...(form.getValues("appointmentDurations") ?? {}) };
		const num = parseInt(raw, 10);
		if (!raw || Number.isNaN(num) || num < 0) {
			delete current[key];
		} else {
			current[key] = num;
		}
		form.setValue("appointmentDurations", current, { shouldDirty: true });
	}

	const dInput = (key: string) => (
		<Input
			className="h-8 text-center text-sm"
			min="0"
			onChange={(e) => setDuration(key, e.target.value)}
			placeholder="—"
			type="number"
			value={getDuration(key)}
		/>
	);

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
										disabled={isLoading || isEditing}
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
										disabled={isLoading}
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
										disabled={isLoading}
										placeholder="evaluator@domain.com"
										type="email"
										{...field}
									/>
								</FormControl>
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

				<div className="space-y-2">
					<FormLabel>Appointment Durations (minutes)</FormLabel>
					<div className="overflow-x-auto rounded-md border p-3">
						<div className="grid min-w-[380px] grid-cols-5 items-center gap-x-2 gap-y-2 text-sm">
							<div />
							<div className="text-center font-medium text-muted-foreground text-xs">
								(any)
							</div>
							<div className="text-center font-medium text-muted-foreground text-xs">
								ASD
							</div>
							<div className="text-center font-medium text-muted-foreground text-xs">
								ADHD
							</div>
							<div className="text-center font-medium text-muted-foreground text-xs">
								ASD+ADHD
							</div>

							<div className="font-medium">Default</div>
							{dInput("default")}
							<div />
							<div />
							<div />

							<div className="font-medium">DA</div>
							{dInput("DA")}
							{dInput("DA/ASD")}
							{dInput("DA/ADHD")}
							{dInput("DA/ASD+ADHD")}

							<div className="font-medium">EVAL</div>
							{dInput("EVAL")}
							{dInput("EVAL/ASD")}
							{dInput("EVAL/ADHD")}
							{dInput("EVAL/ASD+ADHD")}

							<div className="font-medium">DAEVAL</div>
							{dInput("DAEVAL")}
							{dInput("DAEVAL/ASD")}
							{dInput("DAEVAL/ADHD")}
							{dInput("DAEVAL/ASD+ADHD")}
						</div>
					</div>
					<p className="text-muted-foreground text-xs">
						Specific subtypes override DA/EVAL/DAEVAL, which override Default.
					</p>
				</div>

				<div className="flex justify-end gap-2 pt-4">
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading
							? "Saving..."
							: isEditing
								? "Save Changes"
								: "Create Evaluator"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
