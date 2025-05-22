"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
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
import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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
			return client.fullName
				?.toLowerCase()
				.includes(searchParams.get("search")?.toLowerCase() as string);
		});
	}

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			search: (searchParams.get("search") as string) ?? undefined,
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		const url = new URL(window.location.href);
		if (values.search === "" || values.search === undefined) {
			url.searchParams.delete("search");
		} else {
			url.searchParams.set("search", values.search);
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
								<FormItem className="flex flex-col">
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													variant="outline"
													// biome-ignore lint/a11y/useSemanticElements: <explanation>
													role="combobox"
													className={cn(
														"w-[200px] justify-between",
														!field.value && "text-muted-foreground",
													)}
												>
													{field.value
														? filteredClients.find(
																(client) => client.fullName === field.value,
															)?.fullName
														: "Search"}
													<ChevronsUpDown className="opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="w-[200px] p-0">
											<Command>
												<CommandInput placeholder="Search..." className="h-9" />
												<CommandList>
													<CommandEmpty>No clients found.</CommandEmpty>
													<CommandGroup>
														{filteredClients.map((client) => (
															<CommandItem
																value={client.fullName}
																key={client.fullName}
																onSelect={() => {
																	form.setValue("search", client.fullName);
																}}
															>
																{client.fullName}
																<Check
																	className={cn(
																		"ml-auto",
																		client.fullName === field.value
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
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
								{client.fullName}
							</div>
							<Separator key="separator" className="my-2" />
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
