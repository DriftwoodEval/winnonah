"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Textarea } from "@ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
	text: z.string().refine(
		(text) => {
			const lines = text.split("\n").filter((line) => line.trim() !== "");
			const lineRegex = /^(?:\d+\)?\s*)?(https?:\/\/[^\s]+) - [\w\s]+$/;
			return lines.every((line) => lineRegex.test(line));
		},
		{
			message: "Each line must match the format: [number)] url - type",
		},
	),
});

export type QuestionnaireBulkFormValues = z.infer<typeof formSchema>;

interface QuestionnaireBulkFormProps {
	onSubmit: (values: QuestionnaireBulkFormValues) => void;
}

export function QuestionnaireBulkForm({
	onSubmit,
}: QuestionnaireBulkFormProps) {
	const form = useForm<QuestionnaireBulkFormValues>({
		resolver: zodResolver(formSchema),
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="text"
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Textarea
									className="max-h-[50vh] min-h-48 resize-none"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end gap-2">
					<Button type="submit">Save</Button>
				</div>
			</form>
		</Form>
	);
}
