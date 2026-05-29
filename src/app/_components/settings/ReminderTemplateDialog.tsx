"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Switch } from "@ui/switch";
import { Textarea } from "@ui/textarea";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type ReminderTemplateFormValues,
	reminderTemplateSchema,
} from "~/lib/validations/reminders";
import { api } from "~/trpc/react";

interface ReminderTemplateDialogProps {
	isOpen: boolean;
	onClose: () => void;
	// If initialData is provided, we are in EDIT mode
	initialData?: ReminderTemplateFormValues & { id: number };
}

export function ReminderTemplateDialog({
	isOpen,
	onClose,
	initialData,
}: ReminderTemplateDialogProps) {
	const utils = api.useUtils();
	const isEditing = !!initialData;

	const [offsetUnit, setOffsetUnit] = useState<"hours" | "days">(() =>
		(initialData?.sendOffsetHours ?? 24) >= 24 ? "days" : "hours",
	);

	const { data: offices } = api.offices.getAll.useQuery(undefined, {
		enabled: isOpen,
	});

	const form = useForm<ReminderTemplateFormValues>({
		resolver: zodResolver(reminderTemplateSchema),
		defaultValues: {
			name: "",
			triggerKeyword: null,
			triggerDaEval: null,
			triggerLocationKey: null,
			messageTemplate: "",
			confirmationReply: null,
			sendOffsetHours: 24,
			isActive: true,
			isNoReplyFollowUp: false,
			isConfirmedFollowUp: false,
		},
	});

	useEffect(() => {
		if (isOpen) {
			if (initialData) {
				form.reset(initialData);
				setOffsetUnit(initialData.sendOffsetHours >= 24 ? "days" : "hours");
			} else {
				form.reset({
					name: "",
					triggerKeyword: null,
					triggerDaEval: null,
					triggerLocationKey: null,
					messageTemplate: "",
					confirmationReply: null,
					sendOffsetHours: 24,
					isActive: true,
					isNoReplyFollowUp: false,
					isConfirmedFollowUp: false,
				});
				setOffsetUnit("days");
			}
		}
	}, [initialData, isOpen, form]);

	const upsertTemplate = api.reminders.upsertTemplate.useMutation({
		onSuccess: () => {
			toast.success(isEditing ? "Template updated" : "Template created");
			void utils.reminders.getTemplates.invalidate();
			onClose();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
		},
	});
	const deleteTemplate = api.reminders.deleteTemplate.useMutation({
		onSuccess: () => {
			toast.success("Template deleted");
			void utils.reminders.getTemplates.invalidate();
			onClose();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
		},
	});

	const applyPreviewVars = (t: string) =>
		t
			.replace(/\$START_TIME/g, "9:00 AM")
			.replace(/\$DATE/g, "May 8, 20XX")
			.replace(/\$OFFICE_NAME/g, "Main Office")
			.replace(/\$LOCATION/g, "at 123 Main St, Suite 100");

	const messageTemplate = form.watch("messageTemplate");
	const messagePreview = messageTemplate
		? applyPreviewVars(messageTemplate)
		: undefined;

	const confirmationReply = form.watch("confirmationReply");
	const confirmationPreview = confirmationReply
		? applyPreviewVars(confirmationReply)
		: undefined;

	function onSubmit(values: ReminderTemplateFormValues) {
		const isFollowUp = values.isNoReplyFollowUp || values.isConfirmedFollowUp;
		upsertTemplate.mutate({
			...values,
			triggerKeyword: isFollowUp ? null : values.triggerKeyword || null,
			triggerDaEval: isFollowUp
				? null
				: (values.triggerDaEval as string) === "NONE"
					? null
					: values.triggerDaEval,
			triggerLocationKey: isFollowUp
				? null
				: (values.triggerLocationKey as string) === "NONE"
					? null
					: values.triggerLocationKey,
			...(initialData?.id ? { id: initialData.id } : {}),
		});
	}
	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit Reminder Template" : "Create Reminder Template"}
					</DialogTitle>
					<DialogDescription>
						Templates define how and when reminders are sent based on calendar
						events.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Template Name</FormLabel>
									<FormControl>
										<Input
											placeholder="e.g., ASD Evaluation Reminder"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="triggerKeyword"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Keyword (Title Match)</FormLabel>
									<FormControl>
										<Input
											disabled={
												form.watch("isNoReplyFollowUp") ||
												form.watch("isConfirmedFollowUp") ||
												(!!form.watch("triggerDaEval") &&
													(form.watch("triggerDaEval") as string) !== "NONE")
											}
											placeholder="e.g., ASD"
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="relative flex items-center py-2">
							<div className="grow border-t" />
							<span className="mx-4 shrink text-muted-foreground text-xs uppercase">
								Or
							</span>
							<div className="grow border-t" />
						</div>

						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="triggerDaEval"
								render={({ field }) => (
									<FormItem>
										<FormLabel>DA/Eval</FormLabel>
										<Select
											disabled={
												form.watch("isNoReplyFollowUp") ||
												form.watch("isConfirmedFollowUp") ||
												!!form.watch("triggerKeyword")
											}
											onValueChange={(val) =>
												field.onChange(val === "NONE" ? null : val)
											}
											value={field.value ?? "NONE"}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select type" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="NONE">Any</SelectItem>
												<SelectItem value="EVAL">EVAL</SelectItem>
												<SelectItem value="DA">DA</SelectItem>
												<SelectItem value="DAEVAL">DAEVAL</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="triggerLocationKey"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Location</FormLabel>
										<Select
											disabled={
												form.watch("isNoReplyFollowUp") ||
												form.watch("isConfirmedFollowUp") ||
												!!form.watch("triggerKeyword")
											}
											onValueChange={(val) =>
												field.onChange(val === "NONE" ? null : val)
											}
											value={field.value ?? "NONE"}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Select location" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="NONE">Any</SelectItem>
												{offices?.map((office) => (
													<SelectItem key={office.key} value={office.key}>
														{office.prettyName}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="messageTemplate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Message Template</FormLabel>
									<FormControl>
										<Textarea
											className="min-h-[120px] font-mono"
											placeholder="Hello, this is a reminder..."
											{...field}
										/>
									</FormControl>
									<p className="text-[10px] text-muted-foreground">
										Available: {"$START_TIME, $DATE, $OFFICE_NAME, $LOCATION"}
									</p>
									{messagePreview && (
										<div className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-muted-foreground text-sm">
											{messagePreview}
										</div>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="confirmationReply"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Confirmation Reply (Optional)</FormLabel>
									<FormControl>
										<Textarea
											className="min-h-[120px] font-mono"
											placeholder="Thank you for confirming..."
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<p className="text-[10px] text-muted-foreground">
										Available: {"$START_TIME, $DATE, $OFFICE_NAME, $LOCATION"}
									</p>
									{confirmationPreview && (
										<div className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-muted-foreground text-sm">
											{confirmationPreview}
										</div>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="sendOffsetHours"
							render={({ field }) => {
								const displayValue =
									offsetUnit === "days" ? field.value / 24 : field.value;
								return (
									<FormItem>
										<FormLabel>Send Before Appointment</FormLabel>
										<div className="flex gap-2">
											<FormControl>
												<Input
													className="w-24"
													min={1}
													onChange={(e) => {
														const val = Number(e.target.value);
														field.onChange(
															offsetUnit === "days"
																? Math.round(val * 24)
																: val,
														);
													}}
													step={offsetUnit === "days" ? 0.5 : 1}
													type="number"
													value={displayValue}
												/>
											</FormControl>
											<Select
												onValueChange={(v: "hours" | "days") => {
													setOffsetUnit(v);
												}}
												value={offsetUnit}
											>
												<SelectTrigger className="w-28">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="hours">Hours</SelectItem>
													<SelectItem value="days">Days</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						<FormField
							control={form.control}
							name="isNoReplyFollowUp"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>No-Reply Follow-up</FormLabel>
										<FormDescription>
											Only send if a previous reminder has not been confirmed.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={(checked) => {
												field.onChange(checked);
												if (checked)
													form.setValue("isConfirmedFollowUp", false);
											}}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="isConfirmedFollowUp"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
									<div className="space-y-0.5">
										<FormLabel>Confirmed Follow-up</FormLabel>
										<FormDescription>
											Only send if the appointment HAS been confirmed.
										</FormDescription>
									</div>
									<FormControl>
										<Switch
											checked={field.value}
											onCheckedChange={(checked) => {
												field.onChange(checked);
												if (checked) form.setValue("isNoReplyFollowUp", false);
											}}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						<div className="flex gap-3 pt-4">
							<Button
								className="flex-1"
								disabled={upsertTemplate.isPending}
								type="submit"
							>
								{upsertTemplate.isPending
									? isEditing
										? "Saving..."
										: "Creating..."
									: isEditing
										? "Save Changes"
										: "Create Template"}
							</Button>
							<Button
								disabled={upsertTemplate.isPending}
								onClick={onClose}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
						</div>
						{isEditing && initialData?.id && (
							<Button
								className="w-full"
								disabled={deleteTemplate.isPending}
								onClick={() => {
									if (
										window.confirm(
											"Delete this template? This cannot be undone.",
										)
									) {
										deleteTemplate.mutate({ id: initialData.id });
									}
								}}
								type="button"
								variant="destructive"
							>
								{deleteTemplate.isPending ? "Deleting..." : "Delete Template"}
							</Button>
						)}
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
