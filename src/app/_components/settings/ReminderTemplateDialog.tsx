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
import { Textarea } from "@ui/textarea";
import { useEffect } from "react";
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
		},
	});

	useEffect(() => {
		if (isOpen) {
			if (initialData) {
				form.reset(initialData);
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
				});
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
	function onSubmit(values: ReminderTemplateFormValues) {
		upsertTemplate.mutate({
			...values,
			triggerKeyword: values.triggerKeyword || null,
			triggerDaEval:
				(values.triggerDaEval as string) === "NONE"
					? null
					: values.triggerDaEval,
			triggerLocationKey:
				(values.triggerLocationKey as string) === "NONE"
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
												!!form.watch("triggerDaEval") &&
												(form.watch("triggerDaEval") as string) !== "NONE"
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
											disabled={!!form.watch("triggerKeyword")}
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
												<SelectItem value="NONE">None</SelectItem>
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
											disabled={!!form.watch("triggerKeyword")}
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
												<SelectItem value="NONE">None</SelectItem>
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
									<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
										Available: {"{startTime}, {date}"}
									</p>
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
											placeholder="Hello, we haven't heard from you..."
											{...field}
											value={field.value ?? ""}
										/>
									</FormControl>
									<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
										Available: {"{startTime}, {date}"}
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="sendOffsetHours"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Send Offset (Hours Before Event)</FormLabel>
									<FormControl>
										<Input
											type="number"
											{...field}
											onChange={(e) => field.onChange(Number(e.target.value))}
										/>
									</FormControl>
									<FormMessage />
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
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
