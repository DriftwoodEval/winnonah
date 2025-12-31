"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Checkbox } from "@ui/checkbox";
import DateTimePicker from "@ui/date-time-picker";
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
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Switch } from "@ui/switch";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "~/trpc/react";

const DAYS_OF_WEEK = [
	{ label: "Mon", value: "MO" },
	{ label: "Tue", value: "TU" },
	{ label: "Wed", value: "WE" },
	{ label: "Thu", value: "TH" },
	{ label: "Fri", value: "FR" },
	{ label: "Sat", value: "SA" },
	{ label: "Sun", value: "SU" },
];

const formSchema = z
	.object({
		startDate: z.date({ error: "Start time is required." }),
		endDate: z.date({ error: "End time is required." }),
		isUnavailability: z.boolean(),
		isRecurring: z.boolean(),
		recurrenceFreq: z.enum(["never", "daily", "weekly", "monthly"]),
		weeklyDays: z.array(z.string()).optional(),
		monthlyDay: z.number().min(1).max(31).optional(),
		recurrenceEndDate: z.date().optional().nullable(),
		recurrenceCount: z.number().min(1).optional().nullable(),
		recurrenceEndType: z.enum(["never", "on", "after"]),
		officeKeys: z.array(z.string()).optional(),
	})
	.refine((data) => data.startDate < data.endDate, {
		message: "End time must be after start time.",
		path: ["endDate"],
	})
	.refine(
		(data) =>
			data.isUnavailability ||
			(data.officeKeys !== undefined && data.officeKeys.length > 0),
		{
			message:
				"At least one office must be selected if not inputting availability.",
			path: ["officeKeys"],
		},
	);

type FormValues = z.infer<typeof formSchema>;

export function AvailabilityForm() {
	const utils = api.useUtils();
	const { data: session } = useSession();
	const evaluatorId = session?.user.evaluatorId ?? 0;

	const { data: outOfOfficePriority, isLoading: isLoadingOutOfOfficePriority } =
		api.evaluators.getOutOfOfficePriority.useQuery(evaluatorId, {
			enabled: !!evaluatorId,
		});

	const defaultDate = new Date();
	defaultDate.setDate(defaultDate.getDate() + 14);

	const defaultStartDate = new Date(
		defaultDate.getFullYear(),
		defaultDate.getMonth(),
		defaultDate.getDate(),
		9,
		0,
		0,
	);

	const defaultEndDate = new Date(
		defaultDate.getFullYear(),
		defaultDate.getMonth(),
		defaultDate.getDate(),
		17,
		0,
		0,
	);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			startDate: defaultStartDate,
			endDate: defaultEndDate,
			isUnavailability: false,
			isRecurring: false,
			recurrenceFreq: "never",
			weeklyDays: [],
			monthlyDay: 1,
			recurrenceEndDate: null,
			recurrenceCount: null,
			recurrenceEndType: "never",
			officeKeys: [],
		},
	});

	// Effect to set isUnavailability and disable switch if outOfOfficePriority is true
	useEffect(() => {
		if (outOfOfficePriority) {
			form.setValue("isUnavailability", true);
		}
	}, [outOfOfficePriority, form]);

	const isUnavailability = form.watch("isUnavailability");
	const isRecurring = form.watch("isRecurring");
	const recurrenceFreq = form.watch("recurrenceFreq");
	const recurrenceEndType = form.watch("recurrenceEndType");
	const officeKeys = form.watch("officeKeys");

	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();

	const createAvailability = api.google.createAvailability.useMutation({
		onSuccess: (_, variables) => {
			const officeText =
				variables.officeKeys && variables.officeKeys.length > 1
					? `${variables.officeKeys.length} offices`
					: offices?.find((o) => o.key === variables.officeKeys?.[0])
							?.prettyName || "Selected Office";
			toast.success(
				`Event created! Type: ${isUnavailability ? "Out of Office" : `Available at ${officeText}`}`,
			);
			form.reset();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
			console.error(error);
		},
	});

	function buildRRule(values: FormValues): string | undefined {
		if (!values.isRecurring || values.recurrenceFreq === "never") {
			return undefined;
		}

		let rrule = `RRULE:FREQ=${values.recurrenceFreq.toUpperCase()}`;

		if (
			values.recurrenceFreq === "weekly" &&
			values.weeklyDays &&
			values.weeklyDays.length > 0
		) {
			rrule += `;BYDAY=${values.weeklyDays.join(",")}`;
		}

		if (values.recurrenceFreq === "monthly" && values.monthlyDay) {
			rrule += `;BYMONTHDAY=${values.monthlyDay}`;
		}

		if (values.recurrenceEndType === "on" && values.recurrenceEndDate) {
			const until = format(values.recurrenceEndDate, "yyyyMMdd'T'HHmmss'Z'");
			rrule += `;UNTIL=${until}`;
		} else if (values.recurrenceEndType === "after" && values.recurrenceCount) {
			rrule += `;COUNT=${values.recurrenceCount}`;
		}

		return rrule;
	}

	async function onSubmit(values: FormValues) {
		if (values.startDate >= values.endDate) {
			form.setError("endDate", {
				message: "End time must be after start time.",
			});
			return;
		}

		const rruleString = buildRRule(values);

		const finalOfficeKeys = values.officeKeys;

		await createAvailability.mutateAsync({
			startDate: values.startDate,
			endDate: values.endDate,
			isRecurring: values.isRecurring,
			recurrenceRule: rruleString,
			isUnavailability: values.isUnavailability,
			officeKeys: finalOfficeKeys,
		});

		utils.google.getAvailability.invalidate();
	}

	return (
		<div className="flex flex-col">
			<h2 className="mb-4 font-bold text-2xl">Declare Your Time</h2>
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					{/* Availability vs. Unavailability Toggle */}
					<FormField
						control={form.control}
						name="isUnavailability"
						render={({ field }) => (
							<FormItem
								className={`flex flex-row items-center justify-between rounded-lg border p-4 transition-colors ${field.value ? "border-destructive bg-destructive/10" : "border-primary bg-primary/10"}`}
							>
								<div className="space-y-0.5">
									<FormLabel className="font-semibold text-base">
										Availability Mode
									</FormLabel>
									<FormDescription
										className={
											field.value ? "text-destructive" : "text-primary"
										}
									>
										{outOfOfficePriority
											? "Out of Office priority enabled. Only Out of Office events can be created."
											: field.value
												? "You are declaring unavailability."
												: "You are declaring availability."}
									</FormDescription>
								</div>
								<FormControl>
									<Switch
										checked={field.value}
										disabled={outOfOfficePriority}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
							</FormItem>
						)}
					/>

					{!isUnavailability && (
						<FormField
							control={form.control}
							name="officeKeys"
							render={({ field }) => (
								<FormItem className="space-y-3 rounded-md border p-4">
									<FormLabel className="font-semibold text-base">
										Available Office Locations
									</FormLabel>

									{isLoadingOffices ? (
										<p>Loading offices...</p>
									) : (
										<div className="flex flex-col gap-2">
											<FormItem className="flex items-center space-x-2">
												<Checkbox
													checked={officeKeys?.length === offices?.length}
													onCheckedChange={(checked) => {
														const allOfficeKeys =
															offices?.map((o) => o.key) || [];
														field.onChange(checked ? allOfficeKeys : []);
													}}
												/>
												<FormLabel className="font-normal">
													Any Office
												</FormLabel>
											</FormItem>
											<div className="flex flex-row flex-wrap gap-4">
												{offices?.map((office) => (
													<FormItem
														className="flex items-center space-x-2"
														key={office.key}
													>
														<FormControl>
															<Checkbox
																checked={field.value?.includes(office.key)}
																onCheckedChange={(checked) => {
																	const current = field.value || [];
																	const updated = checked
																		? [...current, office.key]
																		: current.filter(
																				(key) => key !== office.key,
																			);
																	field.onChange(updated);
																}}
															/>
														</FormControl>
														<FormLabel className="font-normal">
															{office.prettyName}
														</FormLabel>
													</FormItem>
												))}
											</div>
										</div>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
					)}

					<Separator />
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<FormField
							control={form.control}
							name="startDate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Start Date/Time</FormLabel>
									<FormControl>
										<DateTimePicker
											onChange={(date) => {
												if (date) {
													field.onChange(date);
													const currentEnd = form.getValues("endDate");
													if (currentEnd && date >= currentEnd) {
														form.setValue(
															"endDate",
															new Date(date.getTime() + 3600000),
														);
													}
												}
											}}
											value={field.value}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="endDate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>End Date/Time</FormLabel>
									<FormControl>
										<DateTimePicker
											onChange={(date) => {
												if (date) {
													field.onChange(date);
													const currentStart = form.getValues("startDate");
													if (currentStart && date <= currentStart) {
														form.setValue(
															"startDate",
															new Date(date.getTime() - 3600000),
														);
													}
												}
											}}
											value={field.value}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>

					<Separator />
					{/* Recurrence Toggle */}
					<div className="flex flex-row items-center justify-between">
						<Label className="font-semibold text-base">Repeating Event</Label>
						<Switch
							checked={isRecurring}
							onCheckedChange={(checked: boolean) => {
								form.setValue("isRecurring", checked);
								if (!checked) {
									form.setValue("recurrenceFreq", "never");
								} else if (form.getValues("recurrenceFreq") === "never") {
									form.setValue("recurrenceFreq", "weekly"); // Default to weekly when turned on
								}
							}}
						/>
					</div>
					{isRecurring && (
						<div className="space-y-4 rounded-md border bg-background p-4">
							<FormField
								control={form.control}
								name="recurrenceFreq"
								render={({ field }) => (
									<FormItem className="space-y-3">
										<FormLabel className="font-medium text-sm">
											Repeat Frequency
										</FormLabel>
										<FormControl>
											<RadioGroup
												className="flex flex-col space-y-2"
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="daily" />
													</FormControl>
													<FormLabel className="font-normal">Daily</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="weekly" />
													</FormControl>
													<FormLabel className="font-normal">Weekly</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="monthly" />
													</FormControl>
													<FormLabel className="font-normal">Monthly</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{recurrenceFreq === "weekly" && (
								<FormField
									control={form.control}
									name="weeklyDays"
									render={() => (
										<FormItem className="space-y-3">
											<FormLabel className="font-medium text-sm">
												Repeat on Days
											</FormLabel>
											<div className="flex flex-wrap gap-3">
												{DAYS_OF_WEEK.map((day) => (
													<FormField
														control={form.control}
														key={day.value}
														name="weeklyDays"
														render={({ field }) => (
															<FormItem className="flex items-center space-x-2 space-y-0">
																<FormControl>
																	<Checkbox
																		checked={field.value?.includes(day.value)}
																		onCheckedChange={(checked) => {
																			const current = field.value || [];
																			const updated = checked
																				? [...current, day.value]
																				: current.filter(
																						(d) => d !== day.value,
																					);
																			field.onChange(updated);
																		}}
																	/>
																</FormControl>
																<FormLabel className="font-normal text-sm">
																	{day.label}
																</FormLabel>
															</FormItem>
														)}
													/>
												))}
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{recurrenceFreq === "monthly" && (
								<FormField
									control={form.control}
									name="monthlyDay"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="font-medium text-sm">
												Day of Month
											</FormLabel>
											<FormControl>
												<Input
													className="w-24"
													max={31}
													min={1}
													onChange={(e) =>
														field.onChange(parseInt(e.target.value, 10) || 1)
													}
													type="number"
													value={field.value || 1}
												/>
											</FormControl>
											<FormDescription>
												Repeats on day {field.value} of each month
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<Separator />

							<FormField
								control={form.control}
								name="recurrenceEndType"
								render={({ field }) => (
									<FormItem className="space-y-3">
										<FormLabel className="font-medium text-sm">Ends</FormLabel>
										<FormControl>
											<RadioGroup
												className="flex flex-col space-y-3"
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="never" />
													</FormControl>
													<FormLabel className="font-normal">Never</FormLabel>
												</FormItem>

												<FormItem className="flex items-start space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem className="mt-2" value="on" />
													</FormControl>
													<div className="flex-1 space-y-2">
														<FormLabel className="font-normal">
															On date
														</FormLabel>
														{recurrenceEndType === "on" && (
															<FormField
																control={form.control}
																name="recurrenceEndDate"
																render={({ field }) => (
																	<Popover>
																		<PopoverTrigger asChild>
																			<Button
																				className="w-full justify-start text-left font-normal"
																				variant="outline"
																			>
																				<CalendarIcon className="mr-2 h-4 w-4" />
																				{field.value
																					? format(field.value, "PPP")
																					: "Pick a date"}
																			</Button>
																		</PopoverTrigger>
																		<PopoverContent className="w-auto p-0">
																			<Calendar
																				autoFocus
																				captionLayout="label"
																				mode="single"
																				onSelect={field.onChange}
																				selected={field.value || undefined}
																			/>
																		</PopoverContent>
																	</Popover>
																)}
															/>
														)}
													</div>
												</FormItem>

												<FormItem className="flex items-start space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem className="mt-2" value="after" />
													</FormControl>
													<div className="flex-1 space-y-2">
														<FormLabel className="font-normal">
															After number of occurrences
														</FormLabel>
														{recurrenceEndType === "after" && (
															<FormField
																control={form.control}
																name="recurrenceCount"
																render={({ field }) => (
																	<Input
																		className="w-32"
																		min={1}
																		onChange={(e) =>
																			field.onChange(
																				parseInt(e.target.value, 10) || null,
																			)
																		}
																		placeholder="10"
																		type="number"
																		value={field.value || ""}
																	/>
																)}
															/>
														)}
													</div>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					)}
					<Button
						className="w-full"
						disabled={createAvailability.isPending}
						type="submit"
					>
						{createAvailability.isPending
							? "Submitting..."
							: `Save Time as ${isUnavailability ? "Unavailable" : "Available"}`}
					</Button>
				</form>
			</Form>
		</div>
	);
}
