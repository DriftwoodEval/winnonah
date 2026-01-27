"use client";

import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Checkbox } from "@ui/checkbox";
import DateTimePicker from "@ui/date-time-picker";
import {
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
import { add, format, sub } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
	type AvailabilityFormValues,
	DAYS_OF_WEEK,
} from "~/lib/validations/availability";
import { api } from "~/trpc/react";

interface AvailabilityFieldsProps {
	form: UseFormReturn<AvailabilityFormValues>;
	hideModeToggle?: boolean;
	outOfOfficePriority?: boolean;
}

export function AvailabilityFields({
	form,
	hideModeToggle = false,
	outOfOfficePriority = false,
}: AvailabilityFieldsProps) {
	const isUnavailability = form.watch("isUnavailability");
	const isAllDay = form.watch("isAllDay");
	const isRecurring = form.watch("isRecurring");
	const recurrenceFreq = form.watch("recurrenceFreq");
	const recurrenceEndType = form.watch("recurrenceEndType");
	const officeKeys = form.watch("officeKeys");

	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();

	return (
		<div className="space-y-6">
			{!hideModeToggle && (
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
									className={field.value ? "text-destructive" : "text-primary"}
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
												const allOfficeKeys = offices?.map((o) => o.key) || [];
												field.onChange(checked ? allOfficeKeys : []);
											}}
										/>
										<FormLabel className="font-normal">Any Office</FormLabel>
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
																: current.filter((key) => key !== office.key);
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

			<FormField
				control={form.control}
				name="isAllDay"
				render={({ field }) => (
					<FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
						<div className="space-y-0.5">
							<FormLabel className="font-semibold text-base">All Day</FormLabel>
							<FormDescription>
								Sets the event to cover the entire day.
							</FormDescription>
						</div>
						<FormControl>
							<Switch
								checked={field.value}
								onCheckedChange={(checked) => {
									field.onChange(checked);
									if (checked) {
										const start = form.getValues("startDate");
										const allDayStart = new Date(start);
										allDayStart.setHours(0, 0, 0, 0);

										const currentEnd = form.getValues("endDate");
										let allDayEnd = new Date(currentEnd);
										allDayEnd.setHours(0, 0, 0, 0);

										if (allDayEnd <= allDayStart) {
											allDayEnd = add(allDayStart, { days: 1 });
										}

										form.setValue("startDate", allDayStart);
										form.setValue("endDate", allDayEnd);
									}
								}}
							/>
						</FormControl>
					</FormItem>
				)}
			/>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<FormField
					control={form.control}
					name="startDate"
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								{isAllDay ? "Start Date" : "Start Date/Time"}
							</FormLabel>
							<FormControl>
								<DateTimePicker
									hideTime={isAllDay}
									onChange={(date) => {
										if (date) {
											if (isAllDay) {
												const newStart = new Date(date);
												newStart.setHours(0, 0, 0, 0);
												field.onChange(newStart);

												const currentEnd = form.getValues("endDate");
												if (currentEnd && currentEnd <= newStart) {
													form.setValue("endDate", add(newStart, { days: 1 }));
												}
											} else {
												field.onChange(date);
												const currentEnd = form.getValues("endDate");
												if (currentEnd && date >= currentEnd) {
													form.setValue(
														"endDate",
														new Date(date.getTime() + 3600000),
													);
												}
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
							<FormLabel>
								{isAllDay ? "End Date (Inclusive)" : "End Date/Time"}
							</FormLabel>
							<FormControl>
								<DateTimePicker
									hideTime={isAllDay}
									onChange={(date) => {
										if (date) {
											if (isAllDay) {
												const newEnd = new Date(date);
												newEnd.setHours(0, 0, 0, 0);
												const exclusiveEnd = add(newEnd, { days: 1 });
												field.onChange(exclusiveEnd);

												const currentStart = form.getValues("startDate");
												if (currentStart && exclusiveEnd <= currentStart) {
													form.setValue(
														"startDate",
														sub(exclusiveEnd, { days: 1 }),
													);
												}
											} else {
												field.onChange(date);
												const currentStart = form.getValues("startDate");
												if (currentStart && date <= currentStart) {
													form.setValue(
														"startDate",
														new Date(date.getTime() - 3600000),
													);
												}
											}
										}
									}}
									value={isAllDay ? sub(field.value, { days: 1 }) : field.value}
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

					<FormField
						control={form.control}
						name="interval"
						render={({ field }) => (
							<FormItem className="space-y-2">
								<FormLabel className="font-medium text-sm">
									Repeat every
								</FormLabel>
								<div className="flex items-center gap-2">
									<FormControl>
										<Input
											className="w-20"
											min={1}
											onChange={(e) =>
												field.onChange(parseInt(e.target.value, 10) || 1)
											}
											type="number"
											value={field.value}
										/>
									</FormControl>
									<span className="text-muted-foreground text-sm">
										{recurrenceFreq === "daily"
											? field.value === 1
												? "day"
												: "days"
											: recurrenceFreq === "weekly"
												? field.value === 1
													? "week"
													: "weeks"
												: field.value === 1
													? "month"
													: "months"}
									</span>
								</div>
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
																		: current.filter((d) => d !== day.value);
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
												<FormLabel className="font-normal">On date</FormLabel>
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
		</div>
	);
}
