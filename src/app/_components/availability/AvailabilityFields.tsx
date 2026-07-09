"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
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
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Switch } from "@ui/switch";
import { add, addMonths } from "date-fns";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
	type AvailabilityFormValues,
	DAYS_OF_WEEK,
} from "~/lib/validations/availability";
import { api } from "~/trpc/react";

interface AvailabilityFieldsProps {
	form: UseFormReturn<AvailabilityFormValues>;
	outOfOfficePriority?: boolean;
}

function NumberInput({
	value,
	onChange,
	min = 1,
	max,
	className,
}: {
	value: number;
	onChange: (val: number) => void;
	min?: number;
	max?: number;
	className?: string;
}) {
	const [local, setLocal] = useState(String(value));

	useEffect(() => {
		setLocal(String(value));
	}, [value]);

	return (
		<Input
			className={className}
			max={max}
			min={min}
			onBlur={() => {
				const parsed = parseInt(local, 10);
				const clamped = Number.isNaN(parsed)
					? min
					: max !== undefined
						? Math.min(max, Math.max(min, parsed))
						: Math.max(min, parsed);
				onChange(clamped);
				setLocal(String(clamped));
			}}
			onChange={(e) => setLocal(e.target.value)}
			type="number"
			value={local}
		/>
	);
}

export function AvailabilityFields({
	form,
	outOfOfficePriority = false,
}: AvailabilityFieldsProps) {
	const isUnavailability = form.watch("isUnavailability");
	const isAllDay = form.watch("isAllDay");
	const isRecurring = form.watch("isRecurring");
	const recurrenceFreq = form.watch("recurrenceFreq");
	const recurrenceEndType = form.watch("recurrenceEndType");
	const officeKeys = form.watch("officeKeys");
	const startDate = form.watch("startDate");

	const { data: offices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();

	// const minDate = startOfDay(addMonths(new Date(), 1));
	const minDate = undefined;
	const calendarStartMonth = new Date(2020, 0, 1);
	const calendarEndMonth = add(new Date(), { years: 5 });

	return (
		<div className="space-y-6">
			{outOfOfficePriority && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Out of Office Priority</AlertTitle>
					<AlertDescription>
						Out of Office priority is enabled for your account. You can only
						declare unavailability at this time.
					</AlertDescription>
				</Alert>
			)}

			{!isUnavailability && !outOfOfficePriority && (
				<>
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
										<FormItem className="flex items-center">
											<FormControl>
												{(() => {
													const allKeys = [
														...(offices?.map((o) => o.key) ?? []),
														"VIRTUAL",
													];
													const selectedCount = allKeys.filter((k) =>
														officeKeys?.includes(k),
													).length;
													const allSelected =
														allKeys.length > 0 &&
														selectedCount === allKeys.length;
													return (
														<Checkbox
															checked={allSelected}
															onCheckedChange={(checked) => {
																field.onChange(checked ? allKeys : []);
															}}
														/>
													);
												})()}
											</FormControl>
											<FormLabel className="font-normal">Any Office</FormLabel>
										</FormItem>
										<div className="flex flex-row flex-wrap gap-4">
											{offices?.map((office) => (
												<FormItem
													className="flex items-center"
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
											<FormItem className="flex items-center">
												<FormControl>
													<Checkbox
														checked={field.value?.includes("VIRTUAL")}
														onCheckedChange={(checked) => {
															const current = field.value || [];
															const updated = checked
																? [...current, "VIRTUAL"]
																: current.filter((key) => key !== "VIRTUAL");
															field.onChange(updated);
														}}
													/>
												</FormControl>
												<FormLabel className="font-normal">Virtual</FormLabel>
											</FormItem>
										</div>
									</div>
								)}
								<FormMessage />
							</FormItem>
						)}
					/>
					<Separator />
				</>
			)}

			{isUnavailability && (
				<>
					<FormField
						control={form.control}
						name="isAllDay"
						render={({ field }) => (
							<FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
								<div className="space-y-0.5">
									<FormLabel className="font-semibold text-base">
										All Day
									</FormLabel>
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

												if (allDayEnd < allDayStart) {
													allDayEnd = allDayStart;
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
					<Separator />
				</>
			)}

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<FormField
					control={form.control}
					name="startDate"
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								{isAllDay ? "Start Date" : "Start Date/Time"}
							</FormLabel>
							{/* <FormDescription>
								Earliest: {format(minDate, "MMM d, yyyy")}
							</FormDescription> */}
							<FormControl>
								<DateTimePicker
									endMonth={calendarEndMonth}
									hideTime={isAllDay}
									minDate={minDate}
									onChange={(date) => {
										if (date) {
											if (isAllDay) {
												const newStart = new Date(date);
												newStart.setHours(0, 0, 0, 0);
												const oldStart = field.value
													? new Date(field.value)
													: null;
												if (oldStart) oldStart.setHours(0, 0, 0, 0);
												const currentEnd = form.getValues("endDate");
												field.onChange(newStart);
												if (oldStart && currentEnd) {
													const days = Math.round(
														(currentEnd.getTime() - oldStart.getTime()) /
															86400000,
													);
													form.setValue(
														"endDate",
														add(newStart, { days: Math.max(days, 0) }),
													);
												} else {
													form.setValue("endDate", newStart);
												}
											} else {
												const oldStart = field.value;
												const currentEnd = form.getValues("endDate");
												field.onChange(date);
												if (oldStart && currentEnd) {
													const duration =
														currentEnd.getTime() - oldStart.getTime();
													form.setValue(
														"endDate",
														new Date(
															date.getTime() +
																(duration > 0 ? duration : 3600000),
														),
													);
												} else if (!currentEnd || date >= currentEnd) {
													form.setValue(
														"endDate",
														new Date(date.getTime() + 3600000),
													);
												}
											}
										}
									}}
									startMonth={calendarStartMonth}
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
									endMonth={calendarEndMonth}
									hideTime={isAllDay}
									minDate={startDate ?? minDate}
									onChange={(date) => {
										if (date) {
											if (isAllDay) {
												const newEnd = new Date(date);
												newEnd.setHours(0, 0, 0, 0);
												field.onChange(newEnd);

												const currentStart = form.getValues("startDate");
												if (currentStart && newEnd < currentStart) {
													form.setValue("startDate", newEnd);
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
									startMonth={calendarStartMonth}
									value={field.value}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>

			<Separator />

			<FormField
				control={form.control}
				name="isRecurring"
				render={({ field }) => (
					<FormItem className="flex flex-row items-center justify-between">
						<FormLabel className="font-semibold text-base">
							Repeating Event
						</FormLabel>
						<FormControl>
							<Switch
								checked={field.value}
								onCheckedChange={(checked: boolean) => {
									field.onChange(checked);
									if (!checked) {
										form.setValue("recurrenceFreq", "never");
									} else if (form.getValues("recurrenceFreq") === "never") {
										form.setValue("recurrenceFreq", "weekly");
									}
								}}
							/>
						</FormControl>
					</FormItem>
				)}
			/>

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
										<NumberInput
											className="w-20"
											min={1}
											onChange={field.onChange}
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
										<NumberInput
											className="w-24"
											max={31}
											min={1}
											onChange={field.onChange}
											value={field.value ?? 1}
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
										onValueChange={(value) => {
											field.onChange(value);
											if (
												value === "on" &&
												!form.getValues("recurrenceEndDate")
											) {
												form.setValue(
													"recurrenceEndDate",
													addMonths(form.getValues("startDate"), 3),
												);
											}
										}}
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
															<FormItem>
																<FormControl>
																	<DateTimePicker
																		disabled={field.disabled}
																		endMonth={calendarEndMonth}
																		hideTime={true}
																		minDate={startDate ?? minDate}
																		onChange={field.onChange}
																		startMonth={calendarStartMonth}
																		value={field.value ?? undefined}
																	/>
																</FormControl>
																<FormMessage />
															</FormItem>
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
