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

	const form = useForm<ReminderTemplateFormValues>({
		resolver: zodResolver(reminderTemplateSchema),
		defaultValues: {
			name: "",
			triggerKeyword: "",
			messageTemplate: "",
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
					triggerKeyword: "",
					messageTemplate: "",
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
									<FormLabel>Trigger Keyword</FormLabel>
									<FormControl>
										<Input placeholder="e.g., ASD" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="messageTemplate"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Message Template</FormLabel>
									<FormControl>
										<Textarea
											className="min-h-[120px] font-mono"
											placeholder="Hello {firstName}, this is a reminder..."
											{...field}
										/>
									</FormControl>
									<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
										Available:{" "}
										{"{firstName}, {lastName}, {startTime}, {daEval}"}
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
