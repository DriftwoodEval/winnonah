"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import MultipleSelector from "@ui/multiple-selector";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Check, ChevronsUpDown, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import { checkRole, cn } from "~/lib/utils";
import type { Client, Evaluator } from "~/server/lib/types";
import { api } from "~/trpc/react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select } from "../ui/select";

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
	const isEditing = !!initialData;

	const { data: allSchoolDistricts, isLoading: isLoadingSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const districtOptions = useMemo(() => {
		return (
			allSchoolDistricts?.map((district) => ({
				value: district.fullName,
				label: district.shortName || district.fullName,
			})) ?? []
		);
	}, [allSchoolDistricts]);

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
							<Popover>
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
						{isLoading
							? "Saving..."
							: isEditing
								? "Save Changes"
								: "Create Evaluator"}
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
			toast.error("Failed to update evaluator", { description: error.message });
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
