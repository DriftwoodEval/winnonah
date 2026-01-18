"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { subYears } from "date-fns";
import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import type { Client } from "~/lib/types";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";

const formSchema = z.object({
	schoolDistrict: z.string(),
	highPriority: z.boolean(),
	autismStop: z.boolean(),
	babyNet: z.boolean(),
	eiAttends: z.boolean(),
});

type ClientFormValues = z.infer<typeof formSchema>;

interface ClientFormProps {
	initialData?: Client;
	onSubmit: (values: ClientFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
	showBabyNetCheckbox?: boolean;
	showEICheckbox?: boolean;
}

const log = logger.child({ module: "EditClientDialog" });

function ClientForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
	showBabyNetCheckbox = false,
	showEICheckbox = false,
}: ClientFormProps) {
	const { data: allSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const can = useCheckPermission();
	const canDistrict = can("clients:schooldistrict");
	const canPriority = can("clients:priority");
	const canBabyNet = can("clients:babynet");
	const canSetEI = can("clients:ei");
	const canAutismStopDisable = can("clients:autismstop:disable");

	const defaultValues = useMemo(() => {
		if (initialData) {
			return {
				schoolDistrict: initialData.schoolDistrict ?? "",
				highPriority: initialData.highPriority ?? false,
				autismStop: initialData.autismStop ?? false,
				babyNet: initialData.babyNet ?? false,
				eiAttends: initialData.eiAttends ?? false,
			};
		}
	}, [initialData]);

	const form = useForm<ClientFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	const [districtsOpen, setDistrictsOpen] = useState(false);

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="schoolDistrict"
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>School District</FormLabel>
							<Popover
								modal
								onOpenChange={setDistrictsOpen}
								open={districtsOpen}
							>
								<PopoverTrigger asChild disabled={!canDistrict}>
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
													)?.shortName ||
													field.value.replace(/ (County )?School District/, "")
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
															setDistrictsOpen(false);
														}}
														value={district.fullName}
													>
														{district.shortName ||
															district.fullName.replace(
																/ (County )?School District/,
																"",
															)}
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

				<div className="space-y-4">
					<FormField
						control={form.control}
						name="highPriority"
						render={({ field }) => (
							<FormItem className="flex flex-row">
								<FormControl>
									<Checkbox
										checked={field.value}
										disabled={!canPriority}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>High Priority</FormLabel>
								</div>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="autismStop"
						render={({ field }) => (
							<FormItem className="flex flex-row">
								<FormControl>
									<Checkbox
										checked={field.value}
										disabled={!canAutismStopDisable && field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>"Autism" in Records</FormLabel>
									<FormDescription>
										Show a popup warning on everyone's first few visits to this
										page and a persistent banner.
									</FormDescription>
								</div>
							</FormItem>
						)}
					/>

					{showBabyNetCheckbox && (
						<FormField
							control={form.control}
							name="babyNet"
							render={({ field }) => (
								<FormItem className="flex flex-row">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={!canBabyNet}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<div className="space-y-1 leading-none">
										<FormLabel>BabyNet</FormLabel>
										<FormDescription>
											Treat client as BabyNet, regardless of insurance on file.
										</FormDescription>
									</div>
								</FormItem>
							)}
						/>
					)}

					{showEICheckbox && (
						<FormField
							control={form.control}
							name="eiAttends"
							render={({ field }) => (
								<FormItem className="flex flex-row">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={!canSetEI}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<div className="space-y-1 leading-none">
										<FormLabel>EI Attends</FormLabel>
										<FormDescription>
											Client's EI wants to be included in meetings.
										</FormDescription>
									</div>
								</FormItem>
							)}
						/>
					)}
				</div>

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
	const dialog = useResponsiveDialog();
	const utils = api.useUtils();

	const BNAgeOutDate = subYears(new Date(), 3);

	const underBNAge = client && client.dob > BNAgeOutDate;

	const showBabyNetCheckbox =
		underBNAge &&
		client.primaryInsurance !== "BabyNet" &&
		client.secondaryInsurance !== "BabyNet";

	const updateClient = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("Client updated successfully!");
			utils.clients.getOne.invalidate();
			dialog.closeDialog();
		},
		onError: (error) => {
			toast.error("Failed to update client", {
				description: error.message,
				duration: 10000,
			});
			log.error(error, "Failed to update client");
		},
	});

	const updateAutismStop = api.clients.autismStop.useMutation({
		onSuccess: () => {
			utils.clients.getOne.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update autism stop", {
				description: String(error.message),
				duration: 10000,
			});
			log.error(error, "Failed to update autism stop");
		},
	});

	function onEditSubmit(values: ClientFormValues) {
		const autismStopChanged = values.autismStop !== client.autismStop;

		const updatedValues = {
			clientId: client.id,
			schoolDistrict: values.schoolDistrict,
			highPriority: values.highPriority,
			babyNet: values.babyNet,
			eiAttends: values.eiAttends,
		};

		updateClient.mutate(updatedValues);

		if (autismStopChanged) {
			updateAutismStop.mutate({
				clientId: client.id,
				autismStop: values.autismStop,
			});
		}
	}

	const trigger = <Pencil className="cursor-pointer" size={16} />;

	return (
		<ResponsiveDialog
			open={dialog.open}
			setOpen={dialog.setOpen}
			title="Edit Client"
			trigger={trigger}
		>
			<ClientForm
				initialData={client}
				isLoading={updateClient.isPending || updateAutismStop.isPending}
				onClose={dialog.closeDialog}
				onSubmit={onEditSubmit}
				showBabyNetCheckbox={showBabyNetCheckbox}
				showEICheckbox={underBNAge}
			/>
		</ResponsiveDialog>
	);
}
