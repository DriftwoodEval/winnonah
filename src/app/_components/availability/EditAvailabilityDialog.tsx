"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Checkbox } from "@ui/checkbox";
import DateTimePicker from "@ui/date-time-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
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
import { CalendarIcon, Trash2 } from "lucide-react";
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
		startDate: z.date({ message: "Start time is required." }),
		endDate: z.date({ message: "End time is required." }),
		isUnavailability: z.boolean(),
		isRecurring: z.boolean(),
		recurrenceFreq: z.enum(["never", "daily", "weekly", "monthly"]),
		weeklyDays: z.array(z.string()).optional(),
		monthlyDay: z.number().min(1).max(31).optional(),
		recurrenceEndDate: z.date().optional().nullable(),
		recurrenceCount: z.number().min(1).optional().nullable(),
		recurrenceEndType: z.enum(["never", "on", "after"]),
		officeKeys: z.array(z.string()).optional(),
		scope: z.enum(["this", "all"]),
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

interface EditAvailabilityDialogProps {
	event: {
		id: string;
		summary: string;
		start: Date;
		end: Date;
		isUnavailability: boolean;
		isAllDay: boolean;
		officeKeys?: string[];
		recurrence?: string[];
		recurringEventId?: string | null;
	};
	isOpen: boolean;
	onClose: () => void;
}

export function EditAvailabilityDialog({
	event,
	isOpen,
	onClose,
}: EditAvailabilityDialogProps) {
	const utils = api.useUtils();

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			startDate: event.start,
			endDate: event.end,
			isUnavailability: event.isUnavailability,
			isRecurring: !!event.recurrence && event.recurrence.length > 0,
			recurrenceFreq: "never",
			weeklyDays: [],
			monthlyDay: 1,
			recurrenceEndDate: null,
			recurrenceCount: null,
			recurrenceEndType: "never",
			officeKeys: event.officeKeys || [],
			scope: "this",
		},
	});

	useEffect(() => {
		if (isOpen) {
			const isRecurring = !!event.recurrence && event.recurrence.length > 0;
			let recurrenceFreq: "never" | "daily" | "weekly" | "monthly" = "never";
			let weeklyDays: string[] = [];
			let monthlyDay = 1;
			let recurrenceEndDate: Date | null = null;
			let recurrenceCount: number | null = null;
			let recurrenceEndType: "never" | "on" | "after" = "never";

			if (isRecurring && event.recurrence?.[0]) {
				const rrule = event.recurrence[0];
				if (rrule.includes("FREQ=DAILY")) recurrenceFreq = "daily";
				if (rrule.includes("FREQ=WEEKLY")) recurrenceFreq = "weekly";
				if (rrule.includes("FREQ=MONTHLY")) recurrenceFreq = "monthly";

				if (rrule.includes("BYDAY=")) {
					const match = rrule.match(/BYDAY=([^;]+)/);
					if (match?.[1]) {
						weeklyDays = match[1].split(",");
					}
				}

				if (rrule.includes("BYMONTHDAY=")) {
					const match = rrule.match(/BYMONTHDAY=([^;]+)/);
					if (match?.[1]) {
						monthlyDay = parseInt(match[1], 10);
					}
				}

				if (rrule.includes("UNTIL=")) {
					const match = rrule.match(/UNTIL=([^;]+)/);
					if (match?.[1]) {
						const untilStr = match[1];
						const year = untilStr.substring(0, 4);
						const month = untilStr.substring(4, 6);
						const day = untilStr.substring(6, 8);
						recurrenceEndDate = new Date(`${year}-${month}-${day}`);
						recurrenceEndType = "on";
					}
				} else if (rrule.includes("COUNT=")) {
					const match = rrule.match(/COUNT=([^;]+)/);
					if (match?.[1]) {
						recurrenceCount = parseInt(match[1], 10);
						recurrenceEndType = "after";
					}
				}
			}

			form.reset({
				startDate: event.start,
				endDate: event.end,
				isUnavailability: event.isUnavailability,
				isRecurring: isRecurring,
				recurrenceFreq: recurrenceFreq,
				weeklyDays: weeklyDays,
				monthlyDay: monthlyDay,
				recurrenceEndDate: recurrenceEndDate,
				recurrenceCount: recurrenceCount,
				recurrenceEndType: recurrenceEndType,
				officeKeys: event.officeKeys || [],
				scope: "this",
			});
		}
	}, [isOpen, event, form]);

	const isUnavailability = form.watch("isUnavailability");
	const isRecurring = form.watch("isRecurring");
	const recurrenceFreq = form.watch("recurrenceFreq");
	const recurrenceEndType = form.watch("recurrenceEndType");
	const officeKeys = form.watch("officeKeys");
	const scope = form.watch("scope");

	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();

	const updateAvailability = api.google.updateAvailability.useMutation({
		onSuccess: async () => {
			toast.success("Availability updated successfully.");
			await utils.google.getAvailability.invalidate();
			onClose();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
		},
	});

	const deleteAvailability = api.google.deleteAvailability.useMutation({
		onSuccess: async () => {
			toast.success("Availability deleted successfully.");
			await utils.google.getAvailability.invalidate();
			onClose();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
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
		const rruleString = buildRRule(values);

		let targetId = event.id;
		let isRecurringVal = values.isRecurring;
		let recurrenceRule: string | undefined = rruleString;

		if (event.recurringEventId) {
			// It's a recurring instance
			if (values.scope === "all") {
				targetId = event.recurringEventId;
				// Keep isRecurring and recurrenceRule from form
			} else {
				// Updating just this instance - MUST NOT send recurrence
				isRecurringVal = false;
				recurrenceRule = undefined;
			}
		}

		await updateAvailability.mutateAsync({
			eventId: targetId,
			startDate: values.startDate,
			endDate: values.endDate,
			isRecurring: isRecurringVal,
			recurrenceRule,
			isUnavailability: values.isUnavailability,
			officeKeys: values.officeKeys,
		});
	}

	const isRecurringInstance = !!event.recurringEventId;

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>
						Edit {isUnavailability ? "Unavailability" : "Availability"}
					</DialogTitle>
					<DialogDescription>
						Update your declared time or remove this entry.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
						{/* Recurring Choice */}
						{isRecurringInstance && (
							<FormField
								control={form.control}
								name="scope"
								render={({ field }) => (
									<FormItem className="space-y-3 rounded-md border bg-muted/50 p-4">
										<FormLabel className="font-semibold text-base">
											Recurring Event Options
										</FormLabel>
										<FormControl>
											<RadioGroup
												className="flex flex-col space-y-1"
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="this" />
													</FormControl>
													<FormLabel className="font-normal">
														Just this instance
													</FormLabel>
												</FormItem>
												<FormItem className="flex items-center space-x-3 space-y-0">
													<FormControl>
														<RadioGroupItem value="all" />
													</FormControl>
													<FormLabel className="font-normal">
														All events in the series
													</FormLabel>
												</FormItem>
											</RadioGroup>
										</FormControl>
										<FormDescription>
											Choose whether to update only this specific occurrence or
											the entire repeating series.
										</FormDescription>
									</FormItem>
								)}
							/>
						)}

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
										form.setValue("recurrenceFreq", "weekly");
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
														<FormLabel className="font-normal">
															Weekly
														</FormLabel>
													</FormItem>
													<FormItem className="flex items-center space-x-3 space-y-0">
														<FormControl>
															<RadioGroupItem value="monthly" />
														</FormControl>
														<FormLabel className="font-normal">
															Monthly
														</FormLabel>
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
											<FormLabel className="font-medium text-sm">
												Ends
											</FormLabel>
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
						<div className="flex gap-4">
							<Button
								className="flex-1"
								disabled={updateAvailability.isPending}
								type="submit"
							>
								{updateAvailability.isPending ? "Saving..." : "Save Changes"}
							</Button>
							<Button
								className="shrink-0"
								disabled={deleteAvailability.isPending}
								onClick={() => {
									const targetId =
										scope === "all" && event.recurringEventId
											? event.recurringEventId
											: event.id;
									const msg =
										scope === "all"
											? "Are you sure you want to delete the entire series?"
											: "Are you sure you want to delete this specific occurrence?";
									if (confirm(msg)) {
										deleteAvailability.mutate({ eventId: targetId });
									}
								}}
								type="button"
								variant="destructive"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
