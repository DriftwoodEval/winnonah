"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "~/lib/utils";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";

const formSchema = z.object({
	schoolDistrict: z.string(),
});

type ClientFormValues = z.infer<typeof formSchema>;

interface ClientFormProps {
	initialData?: Client;
	onSubmit: (values: ClientFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

function ClientForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: ClientFormProps) {
	const { data: allSchoolDistricts, isLoading: isLoadingSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const defaultValues = useMemo(() => {
		// If we are editing, populate from initialData
		if (initialData) {
			return {
				schoolDistrict: initialData.schoolDistrict ?? "",
			};
		}
	}, [initialData]);

	const form = useForm<ClientFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="schoolDistrict"
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>School District</FormLabel>
							<Popover modal>
								<PopoverTrigger asChild>
									<FormControl>
										<Button
											className={cn(
												"w-xs justify-between",
												!field.value && "text-muted-foreground",
											)}
											role="combobox"
											variant="outline"
										>
											{field.value && allSchoolDistricts
												? allSchoolDistricts.find(
														(district) => district.fullName === field.value,
													)?.shortName || field.value
												: "Select district"}
											<ChevronsUpDown className="opacity-50" />
										</Button>
									</FormControl>
								</PopoverTrigger>
								<PopoverContent className="w-xs p-0">
									<Command>
										<CommandInput
											className="h-9"
											placeholder="Search districts..."
										/>
										<CommandList>
											<CommandEmpty>No district found.</CommandEmpty>
											<CommandGroup>
												{allSchoolDistricts?.map((district) => (
													<CommandItem
														key={district.id}
														onSelect={() => {
															form.setValue(
																"schoolDistrict",
																district.fullName,
															);
														}}
														value={district.fullName}
													>
														{district.shortName || district.fullName}
														<Check
															className={cn(
																"ml-auto",
																district.id.toString() === field.value
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

				<div className="flex justify-end gap-2 pt-4">
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

export function ClientEditButton({ client }: { client: Client }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const utils = api.useUtils();

	const updateClient = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("Client updated successfully!");
			utils.clients.getOne.invalidate();
			setIsEditDialogOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to update client", { description: error.message });
		},
	});

	function onEditSubmit(values: ClientFormValues) {
		const updatedValues = { ...values, clientId: client.id };
		updateClient.mutate(updatedValues);
	}

	return (
		<>
			<Pencil
				className="cursor-pointer"
				onClick={() => setIsEditDialogOpen(true)}
				size={16}
			/>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Client</DialogTitle>
					</DialogHeader>
					<ClientForm
						initialData={client}
						isLoading={updateClient.isPending}
						onClose={() => setIsEditDialogOpen(false)}
						onSubmit={onEditSubmit}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
