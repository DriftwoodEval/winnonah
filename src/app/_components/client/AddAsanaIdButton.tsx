"use client";

import { Button } from "@components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@components/ui/form";
import { Input } from "@components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";

const formSchema = z.object({
	asanaId: z.string().min(2),
});

export function AddAsanaIdButton({ client }: { client: Client }) {
	const addAsanaIdMutation = api.clients.addAsanaId.useMutation();
	const setAsanaIdMutation = api.clients.updateClient.useMutation();

	const addAsanaId = (asanaId: string) => {
		addAsanaIdMutation.mutate({
			clientId: client.id,
			asanaId: asanaId,
		});
	};

	const setAsanaId = (asanaId: string) => {
		setAsanaIdMutation.mutate({
			clientId: client.id,
			asanaId: asanaId,
		});
		window.location.reload();
	};

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			asanaId: client.asanaId ?? "",
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		addAsanaId(values.asanaId);
		window.location.reload();
	}

	return (
		<>
			<Dialog>
				<DialogTrigger asChild>
					<Button size="sm">Add Asana ID</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Asana ID</DialogTitle>
						<Form {...form}>
							<form
								className="space-y-8"
								onSubmit={form.handleSubmit(onSubmit)}
							>
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

			<Dialog>
				<DialogTrigger asChild>
					<Button size="sm" variant="destructive">
						No Asana
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Client Has No Asana</DialogTitle>
						<DialogDescription>
							Are you sure you want to set this client to have no Asana?
						</DialogDescription>
						<Button onClick={() => setAsanaId("N/A")} variant="destructive">
							Yes
						</Button>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</>
	);
}
