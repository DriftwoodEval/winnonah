"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import MultipleSelector from "@ui/multiple-selector";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	type AppointmentSyncConfig,
	appointmentSyncConfigSchema,
} from "~/lib/validations";
import { api } from "~/trpc/react";

export default function AppointmentsSyncSettings() {
	const can = useCheckPermission();
	const canEdit = can("settings:appointments-sync");
	const utils = api.useUtils();

	const { data: syncConfig, isLoading } = api.pyConfig.getSync.useQuery();

	const form = useForm<AppointmentSyncConfig>({
		resolver: zodResolver(appointmentSyncConfigSchema),
		defaultValues: {
			trusted_appointment_ids: [],
			ignored_appointment_ids: [],
		},
	});

	useEffect(() => {
		if (syncConfig) {
			form.reset(syncConfig);
		}
	}, [syncConfig, form]);

	const updateSyncConfig = api.pyConfig.updateSync.useMutation({
		onSuccess: () => {
			toast.success("Sync configuration updated successfully!");
			utils.pyConfig.getSync.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update sync configuration", {
				description: error.message,
			});
		},
	});

	function onSubmit(values: AppointmentSyncConfig) {
		updateSyncConfig.mutate(values);
	}

	if (isLoading) {
		return <div className="p-4">Loading sync settings...</div>;
	}

	return (
		<div className="px-4">
			<h3 className="pb-4 font-bold text-lg">Appointment Sync Settings</h3>
			<Form {...form}>
				<form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="trusted_appointment_ids"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Trusted Appointment IDs</FormLabel>
								<FormDescription>
									These appointments will be imported even if they don&apos;t
									match Google Calendar or have other issues.
								</FormDescription>
								<FormControl>
									<MultipleSelector
										badgeClassName="bg-primary text-primary-foreground"
										creatable={true}
										disabled={!canEdit}
										emptyIndicator={
											<p className="text-center text-muted-foreground text-sm">
												Type an ID and press enter to add.
											</p>
										}
										onChange={(options) =>
											field.onChange(options.map((opt) => opt.value))
										}
										placeholder="Add trusted appointment IDs..."
										value={field.value.map((id) => ({
											label: id,
											value: id,
										}))}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="ignored_appointment_ids"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Ignored Appointment IDs</FormLabel>
								<FormDescription>
									These appointments will never be imported.
								</FormDescription>
								<FormControl>
									<MultipleSelector
										badgeClassName="bg-destructive text-destructive-foreground"
										creatable={true}
										disabled={!canEdit}
										emptyIndicator={
											<p className="text-center text-muted-foreground text-sm">
												Type an ID and press enter to add.
											</p>
										}
										onChange={(options) =>
											field.onChange(options.map((opt) => opt.value))
										}
										placeholder="Add ignored appointment IDs..."
										value={field.value.map((id) => ({
											label: id,
											value: id,
										}))}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					{canEdit && (
						<div className="flex justify-end">
							<Button disabled={updateSyncConfig.isPending} type="submit">
								{updateSyncConfig.isPending
									? "Saving..."
									: "Save Sync Settings"}
							</Button>
						</div>
					)}
				</form>
			</Form>
		</div>
	);
}
