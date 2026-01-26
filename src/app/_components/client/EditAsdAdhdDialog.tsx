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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ALLOWED_ASD_ADHD_VALUES } from "~/lib/constants";
import type { Client } from "~/lib/models";
import { api } from "~/trpc/react";

const formSchema = z.object({
	asdAdhd: z.enum(ALLOWED_ASD_ADHD_VALUES),
});

interface EditAsdAdhdDialogProps {
	client: Client;
	setOpen: Dispatch<SetStateAction<boolean>>;
}

export function EditAsdAdhdDialog({ client, setOpen }: EditAsdAdhdDialogProps) {
	const utils = api.useUtils();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			asdAdhd:
				(client.asdAdhd as (typeof ALLOWED_ASD_ADHD_VALUES)[number]) ?? "ASD",
		},
	});

	const updateAsdAdhd = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("ASD/ADHD status updated successfully");
			utils.clients.getOne.invalidate();
			setOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to update ASD/ADHD status", {
				description: error.message,
			});
		},
		onSettled: () => {
			setIsSubmitting(false);
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		setIsSubmitting(true);
		updateAsdAdhd.mutate({
			clientId: client.id,
			asdAdhd: values.asdAdhd,
		});
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="asdAdhd"
					render={({ field }) => (
						<FormItem>
							<FormLabel>ASD/ADHD Status</FormLabel>
							<Select defaultValue={field.value} onValueChange={field.onChange}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{ALLOWED_ASD_ADHD_VALUES.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end gap-2">
					<Button
						disabled={isSubmitting}
						onClick={() => setOpen(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button disabled={isSubmitting} type="submit">
						Save
					</Button>
				</div>
			</form>
		</Form>
	);
}
