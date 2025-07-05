"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/app/_components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/app/_components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "~/app/_components/ui/form";
import { Input } from "~/app/_components/ui/input";
import type { Client } from "~/server/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
	asanaId: z.string().min(2),
});

export function AddAsanaIdButton({ client }: { client: Client }) {
	const sql = api.clients.addAsanaId.useMutation();

	const editClient = (asanaId: string) => {
		sql.mutate({
			clientId: client.id,
			asanaId: asanaId,
		});
	};

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			asanaId: client.asanaId ?? "",
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		editClient(values.asanaId);
		window.location.reload();
	}
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="destructive" size="sm">
					Add Asana ID
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Asana ID</DialogTitle>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
							<FormField
								control={form.control}
								name="asanaId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Asana ID</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit">Submit</Button>
						</form>
					</Form>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	);
}
