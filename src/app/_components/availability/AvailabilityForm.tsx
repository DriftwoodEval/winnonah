"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Form } from "@ui/form";
import { useSession } from "next-auth/react";
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

export function AvailabilityForm() {
	const utils = api.useUtils();
	const { data: session } = useSession();
	const evaluatorId = session?.user.evaluatorId ?? 0;

	const { data: outOfOfficePriority } =
		api.evaluators.getOutOfOfficePriority.useQuery(evaluatorId, {
			enabled: !!evaluatorId,
		});

	const defaultDate = new Date();
	defaultDate.setDate(defaultDate.getDate() + 14);

	const defaultStartDate = new Date(
		defaultDate.getFullYear(),
		defaultDate.getMonth(),
		defaultDate.getDate(),
		9,
		0,
		0,
	);

	const defaultEndDate = new Date(
		defaultDate.getFullYear(),
		defaultDate.getMonth(),
		defaultDate.getDate(),
		17,
		0,
		0,
	);

	const form = useForm<AvailabilityFormValues>({
		resolver: zodResolver(availabilityFormSchema),
		defaultValues: {
			startDate: defaultStartDate,
			endDate: defaultEndDate,
			isUnavailability: outOfOfficePriority ?? false,
			isAllDay: false,
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

	// Effect to set isUnavailability when outOfOfficePriority is loaded
	useEffect(() => {
		if (outOfOfficePriority !== undefined) {
			form.setValue("isUnavailability", outOfOfficePriority);
		}
	}, [outOfOfficePriority, form]);

	const isUnavailability = form.watch("isUnavailability");

	const { data: offices } = api.offices.getAll.useQuery();

	const createAvailability = api.google.createAvailability.useMutation({
		onSuccess: async (_, variables) => {
			const officeText =
				variables.officeKeys && variables.officeKeys.length > 1
					? `${variables.officeKeys.length} offices`
					: offices?.find((o) => o.key === variables.officeKeys?.[0])
							?.prettyName || "Selected Office";
			toast.success(
				`Event created! Type: ${isUnavailability ? "Out of Office" : `Available at ${officeText}`}`,
			);
			form.reset();
			await utils.google.getAvailability.invalidate();
		},
		onError: (error) => {
			toast.error(`Error: ${error.message}`);
			console.error(error);
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
		<div className="flex flex-col">
			<h2 className="mb-4 font-bold text-2xl">
				Declare Your {isUnavailability ? "Unavailability" : "Availability"}
			</h2>
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<AvailabilityFields
						form={form}
						outOfOfficePriority={outOfOfficePriority}
					/>
					<Button
						className="w-full"
						disabled={createAvailability.isPending}
						type="submit"
					>
						{createAvailability.isPending
							? "Submitting..."
							: `Save Time as ${isUnavailability ? "Unavailable" : "Available"}`}
					</Button>
				</form>
			</Form>
		</div>
	);
}
