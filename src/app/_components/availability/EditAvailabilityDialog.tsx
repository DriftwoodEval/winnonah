"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
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
} from "@ui/form";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type AvailabilityFormValues,
	availabilityFormSchema,
	buildRRule,
} from "~/lib/validations/availability";
import { api } from "~/trpc/react";
import { AvailabilityFields } from "./AvailabilityFields";

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
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const form = useForm<AvailabilityFormValues>({
		resolver: zodResolver(availabilityFormSchema),
		defaultValues: {
			startDate: event.start,
			endDate: event.end,
			isUnavailability: event.isUnavailability,
			isAllDay: event.isAllDay,
			isRecurring: !!event.recurrence && event.recurrence.length > 0,
			recurrenceFreq: "never",
			interval: 1,
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
			let interval = 1;
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

				if (rrule.includes("INTERVAL=")) {
					const match = rrule.match(/INTERVAL=(\d+)/);
					if (match?.[1]) {
						interval = parseInt(match[1], 10);
					}
				}

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
				isAllDay: event.isAllDay,
				isRecurring: isRecurring,
				recurrenceFreq: recurrenceFreq,
				interval: interval,
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

	const scope = form.watch("scope");

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

	async function onSubmit(values: AvailabilityFormValues) {
		const rruleString = buildRRule(values);

		let targetId = event.id;
		let isRecurringVal = values.isRecurring;
		let recurrenceRule: string | undefined = rruleString;

		if (event.recurringEventId) {
			if (values.scope === "all") {
				targetId = event.recurringEventId;
			} else {
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
			isAllDay: values.isAllDay,
			officeKeys: values.officeKeys,
		});
	}

	const isRecurringInstance = !!event.recurringEventId;

	return (
		<>
			<Dialog onOpenChange={onClose} open={isOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>
							Edit {event.isUnavailability ? "Unavailability" : "Availability"}
						</DialogTitle>
						<DialogDescription>
							Update your declared time or remove this entry.
						</DialogDescription>
					</DialogHeader>

					<Form {...form}>
						<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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
												Choose whether to update only this specific occurrence
												or the entire repeating series.
											</FormDescription>
										</FormItem>
									)}
								/>
							)}

							<AvailabilityFields form={form} />

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
									onClick={() => setIsDeleteDialogOpen(true)}
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

			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							{scope === "all"
								? "Are you sure you want to delete the entire series? This action cannot be undone."
								: "Are you sure you want to delete this specific occurrence? This action cannot be undone."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								const targetId =
									scope === "all" && event.recurringEventId
										? event.recurringEventId
										: event.id;
								deleteAvailability.mutate({ eventId: targetId });
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
