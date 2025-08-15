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
import { useForm } from "react-hook-form";
import { z } from "zod";
import { userRoles } from "~/lib/types";
import type { User } from "~/server/lib/types";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

const formSchema = z.object({
	role: z.enum(userRoles),
});

export type UsersTableFormValues = z.infer<typeof formSchema>;

interface UsersTableFormProps {
	initialData?: User;
	onSubmit: (values: UsersTableFormValues) => void;
	isLoading: boolean;
	onFinished: () => void;
	submitButtonText?: string;
}

export function UsersTableForm({
	initialData,
	onSubmit,
	isLoading,
	onFinished,
}: UsersTableFormProps) {
	const form = useForm<UsersTableFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			role: initialData?.role ?? undefined,
		},
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="flex flex-wrap justify-between">
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Role</FormLabel>
								<Select
									defaultValue={field.value}
									onValueChange={field.onChange}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Object.entries(userRoles).map(([key, value]) => (
											<SelectItem key={key} value={value}>
												{value.charAt(0).toUpperCase() + value.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex justify-end gap-2">
					<Button onClick={onFinished} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading ? "Saving..." : "Submit"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
