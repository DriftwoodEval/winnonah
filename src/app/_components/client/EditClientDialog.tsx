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
import type { Client } from "~/lib/models";
import { cn, localDateToDateOnly } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
import { EiContactCombobox } from "./EiContactCombobox";

const formSchema = z.object({
	schoolDistrict: z.string(),
	highPriority: z.boolean(),
	autismStop: z.boolean(),
	alreadyDx: z.boolean(),
	pause: z.boolean(),
	babyNet: z.boolean(),
	eiContactId: z.number().nullable(),
	eiRemindersEnabled: z.boolean(),
	adminReviewEnabled: z.boolean(),
});

type ClientFormValues = z.infer<typeof formSchema>;

interface ClientFormProps {
	initialData?: Client;
	onSubmit: (values: ClientFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
	showBabyNetCheckbox?: boolean;
	showEICheckbox?: boolean;
	initialAdminReviewEnabled?: boolean;
}

const log = logger.child({ module: "EditClientDialog" });

function ClientForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
	showBabyNetCheckbox = false,
	showEICheckbox = false,
	initialAdminReviewEnabled = false,
}: ClientFormProps) {
	const { data: allSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const can = useCheckPermission();
	const canDistrict = can("clients:schooldistrict");
	const canPriority = can("clients:priority");
	const canBabyNet = can("clients:babynet");
	const canSetEiReminders = can("clients:ei-reminders");
	const canAutismStopDisable = can("clients:autismstop:disable");
	const canAlreadyDx = can("clients:alreadydx");
	const canPause = can("clients:pause");
	const canAdminReview = can("clients:admin:review");

	const defaultValues = useMemo(() => {
		if (initialData) {
			return {
				schoolDistrict: initialData.schoolDistrict ?? "",
				highPriority: initialData.highPriority ?? false,
				autismStop: initialData.autismStop ?? false,
				alreadyDx: initialData.alreadyDx ?? false,
				pause: initialData.pause ?? false,
				babyNet: initialData.babyNet ?? false,
				eiContactId: initialData.eiContactId ?? null,
				eiRemindersEnabled: initialData.eiRemindersEnabled ?? false,
				adminReviewEnabled: initialAdminReviewEnabled,
			};
		}
	}, [initialData, initialAdminReviewEnabled]);

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
												{allSchoolDistricts
													?.filter((district) => !district.isPrivate)
													.map((district) => (
														<CommandItem
															key={district.id}
															onSelect={() => {
																form.setValue(
																	"schoolDistrict",
																	district.fullName,
																	{ shouldDirty: true, shouldValidate: true },
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
																	district.fullName === field.value
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
						name="pause"
						render={({ field }) => (
							<FormItem className="flex flex-row">
								<FormControl>
									<Checkbox
										checked={field.value}
										disabled={!canPause}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>Pause Client</FormLabel>
									<FormDescription>
										Don't send records requests, questionnaires, or automated
										reminders to login to the portal, sign documents, or
										complete questionnaires.
									</FormDescription>
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

					<FormField
						control={form.control}
						name="alreadyDx"
						render={({ field }) => (
							<FormItem className="flex flex-row">
								<FormControl>
									<Checkbox
										checked={field.value}
										disabled={!canAlreadyDx}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel>Already Diagnosed</FormLabel>
									<FormDescription>
										Show a warning banner on the client's page. Doesn't stop
										records requests, questionnaires, or reminders.
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
							name="eiContactId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>EI Contact</FormLabel>
									<EiContactCombobox
										disabled={!canSetEiReminders}
										onChange={field.onChange}
										value={field.value}
									/>
									<FormDescription>
										Reminders enabled below go to this contact's number instead
										of the client's normal phone number.
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					)}

					{showEICheckbox && (
						<FormField
							control={form.control}
							name="eiRemindersEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row">
									<FormControl>
										<Checkbox
											checked={field.value}
											disabled={
												!canSetEiReminders || !form.watch("eiContactId")
											}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<div className="space-y-1 leading-none">
										<FormLabel>EI Reminders Enabled</FormLabel>
										<FormDescription>
											Send templates marked "EI Reminder" (Settings &gt; People)
											to the EI contact above.
										</FormDescription>
									</div>
								</FormItem>
							)}
						/>
					)}

					{canAdminReview && (
						<FormField
							control={form.control}
							name="adminReviewEnabled"
							render={({ field }) => (
								<FormItem className="flex flex-row">
									<FormControl>
										<Checkbox
											checked={field.value}
											onCheckedChange={field.onChange}
										/>
									</FormControl>
									<div className="space-y-1 leading-none">
										<FormLabel>Admin Review</FormLabel>
										<FormDescription>
											Show the Admin Review tab on this client.
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
					<Button disabled={isLoading || !form.formState.isDirty} type="submit">
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
	const can = useCheckPermission();
	const canAdminReview = can("clients:admin:review");

	const { data: reviewData } = api.adminReview.getByClientId.useQuery(
		client.id,
		{ refetchInterval: 60_000, enabled: canAdminReview },
	);

	const BNAgeOutDate = subYears(new Date(), 3);

	const underBNAge =
		client && client.dob > (localDateToDateOnly(BNAgeOutDate) as string);

	const showEICheckbox =
		underBNAge || client.eiRemindersEnabled || !!client.eiContactId;

	const showBabyNetCheckbox =
		underBNAge &&
		!client.primaryInsurance?.toLowerCase().includes("babynet") &&
		!(client.secondaryInsurance ?? []).some((s) =>
			s.toLowerCase().includes("babynet"),
		);

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

	const setAdminReviewEnabled = api.adminReview.setEnabled.useMutation({
		onSuccess: () => {
			utils.adminReview.getByClientId.invalidate(client.id);
		},
		onError: (error) => {
			toast.error("Failed to update admin review", {
				description: error.message,
			});
		},
	});

	function onEditSubmit(values: ClientFormValues) {
		const autismStopChanged = values.autismStop !== client.autismStop;

		const updatedValues = {
			clientId: client.id,
			schoolDistrict: values.schoolDistrict,
			pause: values.pause,
			alreadyDx: values.alreadyDx,
			highPriority: values.highPriority,
			babyNet: values.babyNet,
			eiContactId: values.eiContactId,
			eiRemindersEnabled: values.eiRemindersEnabled,
		};

		updateClient.mutate(updatedValues);

		if (autismStopChanged) {
			updateAutismStop.mutate({
				clientId: client.id,
				autismStop: values.autismStop,
			});
		}

		if (
			canAdminReview &&
			values.adminReviewEnabled !== (reviewData?.enabled ?? false)
		) {
			setAdminReviewEnabled.mutate({
				clientId: client.id,
				enabled: values.adminReviewEnabled,
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
				initialAdminReviewEnabled={reviewData?.enabled ?? false}
				initialData={client}
				isLoading={
					updateClient.isPending ||
					updateAutismStop.isPending ||
					setAdminReviewEnabled.isPending
				}
				onClose={dialog.closeDialog}
				onSubmit={onEditSubmit}
				showBabyNetCheckbox={showBabyNetCheckbox}
				showEICheckbox={showEICheckbox}
			/>
		</ResponsiveDialog>
	);
}
