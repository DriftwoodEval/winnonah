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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Check, ChevronsUpDown, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import type { Client } from "~/lib/models";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";

const formSchema = z.object({
	schoolDistrict: z.string().min(1, "School district is required"),
	coordinates: z
		.string()
		.regex(
			/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/,
			"Invalid coordinates format (lat, long)",
		),
});

type ManualAddressFormValues = z.infer<typeof formSchema>;

interface ManualAddressFormProps {
	initialData?: Client;
	onSubmit: (values: ManualAddressFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

const log = logger.child({ module: "ManualAddressDialog" });

function ManualAddressForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: ManualAddressFormProps) {
	const { data: allSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const can = useCheckPermission();
	const canDistrict = can("clients:schooldistrict");

	const defaultValues = useMemo(() => {
		const lat = initialData?.latitude?.toString();
		const lon = initialData?.longitude?.toString();
		const coords = lat && lon ? `${lat}, ${lon}` : "";

		return {
			schoolDistrict: initialData?.schoolDistrict ?? "",
			coordinates: coords,
		};
	}, [initialData]);

	const form = useForm<ManualAddressFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	const [districtsOpen, setDistrictsOpen] = useState(false);

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-1">
					<p className="font-bold text-sm">Client Address</p>
					{initialData?.address ? (
						<Link
							className="flex items-center gap-1 text-sm hover:underline"
							href={`https://maps.google.com/?q=${encodeURIComponent(initialData.address)}`}
							target="_blank"
						>
							{initialData.address}
							<ExternalLinkIcon size={14} />
						</Link>
					) : (
						<p className="text-muted-foreground text-sm">Unknown</p>
					)}
				</div>

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
								<PopoverContent className="w-full p-0">
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

				<FormField
					control={form.control}
					name="coordinates"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Coordinates (Lat, Long)</FormLabel>
							<FormControl>
								<Input {...field} placeholder="32.123456, -80.123456" />
							</FormControl>
							<p className="text-[10px] text-muted-foreground">
								Copy directly from Google Maps
							</p>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="flex justify-end gap-2">
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

export function ManualAddressDialog({
	client,
	trigger,
}: {
	client: Client;
	trigger: React.ReactNode;
}) {
	const dialog = useResponsiveDialog();
	const utils = api.useUtils();

	const updateClient = api.clients.update.useMutation({
		onSuccess: () => {
			toast.success("Address updated successfully!");
			utils.clients.getOne.invalidate();
			dialog.closeDialog();
		},
		onError: (error) => {
			toast.error("Failed to update address", {
				description: error.message,
				duration: 10000,
			});
			log.error(error, "Failed to update address");
		},
	});

	function onManualAddressSubmit(values: ManualAddressFormValues) {
		const [lat, lon] = values.coordinates.split(",").map((s) => s.trim());

		updateClient.mutate({
			clientId: client.id,
			schoolDistrict: values.schoolDistrict,
			latitude: lat,
			longitude: lon,
			flag: null, // Clear the poor_address_lookup flag
		});
	}

	return (
		<ResponsiveDialog
			open={dialog.open}
			setOpen={dialog.setOpen}
			title="Manual Address Entry"
			trigger={trigger}
		>
			<div>
				<ManualAddressForm
					initialData={client}
					isLoading={updateClient.isPending}
					onClose={dialog.closeDialog}
					onSubmit={onManualAddressSubmit}
				/>
			</div>
		</ResponsiveDialog>
	);
}
