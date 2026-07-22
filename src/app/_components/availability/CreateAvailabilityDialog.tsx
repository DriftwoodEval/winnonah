"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Form } from "@ui/form";
import { signIn } from "next-auth/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type AvailabilityFormValues,
	availabilityFormSchema,
	buildRRule,
} from "~/lib/validations/availability";
import { api } from "~/trpc/react";
import { AvailabilityFields } from "./AvailabilityFields";
import { useOutOfOfficePriority } from "./useOutOfOfficePriority";

interface CreateAvailabilityDialogProps {
	initialData: {
		start: Date;
		end: Date;
		isAllDay: boolean;
		isUnavailability: boolean;
	};
	isOpen: boolean;
	onClose: () => void;
}

export function CreateAvailabilityDialog({
	initialData,
	isOpen,
	onClose,
}: CreateAvailabilityDialogProps) {
	const utils = api.useUtils();

	const { data: outOfOfficePriority } = useOutOfOfficePriority(isOpen);

	const form = useForm<AvailabilityFormValues>({
		resolver: zodResolver(availabilityFormSchema),
		mode: "onTouched",
		defaultValues: {
			startDate: initialData.start,
			endDate: initialData.end,
			isUnavailability: initialData.isUnavailability,
			isAllDay: initialData.isAllDay,
			isRecurring: false,
			recurrenceFreq: "never",
			interval: 1,
			weeklyDays: [],
			monthlyDay: 1,
			recurrenceEndDate: null,
			recurrenceCount: null,
			recurrenceEndType: "never",
			officeKeys: [],
		},
	});

	// Reset form with initialData whenever the dialog opens
	useEffect(() => {
		if (isOpen) {
			form.reset({
				startDate: initialData.start,
				endDate: initialData.end,
				isUnavailability: initialData.isUnavailability,
				isAllDay: initialData.isAllDay,
				isRecurring: false,
				recurrenceFreq: "never",
				interval: 1,
				weeklyDays: [],
				monthlyDay: 1,
				recurrenceEndDate: null,
				recurrenceCount: null,
				recurrenceEndType: "never",
				officeKeys: [],
			});
		}
	}, [isOpen, initialData, form]);

	const isUnavailability = form.watch("isUnavailability");
	const { data: offices } = api.offices.getAll.useQuery();

	const createAvailability = api.google.createAvailability.useMutation({
		onSuccess: async (_, variables) => {
			const officeText =
				variables.officeKeys && variables.officeKeys.length > 0
					? variables.officeKeys.length > 1
						? `${variables.officeKeys.length} offices`
						: offices?.find((o) => o.key === variables.officeKeys?.[0])
								?.prettyName || "Selected Office"
					: "Office";

			toast.success(
				`Event created! Type: ${variables.isUnavailability ? "Out of Office" : `Available at ${officeText}`}`,
			);

			await utils.google.getAvailability.invalidate();
			onClose();
		},
		onError: (error) => {
			if (error.data?.code === "UNAUTHORIZED") {
				toast.error("Google Calendar access not authorized.", {
					description: "Click Re-authorize to restore access.",
					action: {
						label: "Re-authorize",
						onClick: () =>
							signIn(
								"google",
								{ callbackUrl: window.location.href },
								{ prompt: "consent" },
							),
					},
				});
			} else {
				toast.error(`Error: ${error.message}`);
			}
		},
	});

	async function onSubmit(values: AvailabilityFormValues) {
		const rruleString = buildRRule(values);

		await createAvailability.mutateAsync({
			startDate: values.startDate,
			endDate: values.endDate,
			isRecurring: values.isRecurring,
			recurrenceRule: rruleString,
			isUnavailability: values.isUnavailability,
			isAllDay: values.isAllDay,
			officeKeys: values.officeKeys,
		});
	}

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>
						Declare {isUnavailability ? "Unavailability" : "Availability"}
					</DialogTitle>
					<DialogDescription>
						Set your schedule for this time slot.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
						<AvailabilityFields
							form={form}
							outOfOfficePriority={outOfOfficePriority}
						/>

						<div className="flex gap-3">
							<Button
								className="flex-1"
								disabled={
									createAvailability.isPending || !form.formState.isValid
								}
								type="submit"
							>
								{createAvailability.isPending ? "Creating..." : "Save Event"}
							</Button>
							<Button
								disabled={createAvailability.isPending}
								onClick={onClose}
								type="button"
								variant="outline"
							>
								Cancel
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
