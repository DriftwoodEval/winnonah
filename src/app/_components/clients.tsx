"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/app/_components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "~/app/_components/ui/form";
import { Input } from "~/app/_components/ui/input";
import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { api } from "~/trpc/react";

const formSchema = z.object({
	search: z.string().optional(),
});

export function Clients() {
	const clients = api.clients.getSorted.useQuery();

	const searchParams = useSearchParams();

	let filteredClients = clients.data ?? [];

	if (searchParams.get("eval") != null) {
		const evalClients = api.clients.getByNpi.useQuery(
			searchParams.get("eval") as string,
		);
		if (evalClients.data) {
			filteredClients = evalClients.data;
		}
	}

	if (searchParams.get("office")) {
		filteredClients = filteredClients.filter(
			(client) => client.closestOffice === searchParams.get("office"),
		);
	}

	if (searchParams.get("search")) {
		filteredClients = filteredClients.filter((client) => {
			const clientFullname = `${client.firstname} ${client.preferredName} ${client.lastname}`;
			return clientFullname
				.toLowerCase()
				.includes(searchParams.get("search")?.toLowerCase() as string);
		});
	}

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			search: searchParams.get("search") ?? undefined,
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		const url = new URL(window.location.href);
		if (values.search === "" || values.search === undefined) {
			url.searchParams.delete("search");
		} else {
			url.searchParams.set("search", encodeURIComponent(values.search));
		}
		window.location.href = url.toString();
	}

	const utils = api.useUtils();
	const [name, setName] = useState("");

	return (
		<div className="flex flex-col gap-3">
			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="w-2/3 space-y-6"
				>
					<div className="flex gap-3">
						<FormField
							control={form.control}
							name="search"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<Input placeholder="Search" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button type="submit" variant="outline" size="icon">
							<Search />
						</Button>
						{searchParams.get("search") && (
							<Button
								type="button"
								variant="outline"
								size="icon"
								onClick={() => {
									const url = new URL(window.location.href);
									url.searchParams.delete("search");
									window.location.href = url.toString();
								}}
							>
								<X />
							</Button>
						)}
					</div>
				</form>
			</Form>

			<ScrollArea className="dark h-72 w-full rounded-md border bg-card text-card-foreground">
				<div className="p-4">
					<h4 className="mb-4 font-medium text-sm leading-none">Clients</h4>

					{filteredClients.map((client) => (
						<div key={client.id}>
							<div key={client.id} className="text-sm">
								{client.firstname}{" "}
								{client.preferredName ? `(${client.preferredName})` : ""}{" "}
								{client.lastname}
							</div>
							<Separator key="separator" className="my-2" />
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
