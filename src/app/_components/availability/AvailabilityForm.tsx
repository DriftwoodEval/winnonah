"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Form } from "@ui/form";
import { Label } from "@ui/label";
import { Skeleton } from "@ui/skeleton";
import { Switch } from "@ui/switch";
import { addMonths } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { IS_DEV } from "~/lib/utils";
import {
	type AvailabilityFormValues,
	availabilityFormSchema,
	buildRRule,
} from "~/lib/validations/availability";
import { api } from "~/trpc/react";
import { AvailabilityFields } from "./AvailabilityFields";
import {
	DEV_OOO_PARAM,
	useOutOfOfficePriority,
} from "./useOutOfOfficePriority";

function OutOfOfficePriorityDevToggle({
	outOfOfficePriority,
}: {
	outOfOfficePriority: boolean;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const setOverride = (checked: boolean) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set(DEV_OOO_PARAM, String(checked));
		router.replace(`?${params.toString()}`, { scroll: false });
	};

	return (
		<div className="mb-4 flex items-center gap-2 rounded-md border border-dashed p-2 text-xs">
			<Switch checked={outOfOfficePriority} onCheckedChange={setOverride} />
			<Label className="text-xs">
				Dev: acting as {outOfOfficePriority ? "out of office" : "in office"}{" "}
				evaluator
			</Label>
		</div>
	);
}

export function AvailabilityForm() {
	const utils = api.useUtils();
	const { data: session } = useSession();

	const { data: outOfOfficePriority, isLoading: isLoadingOoO } =
		useOutOfOfficePriority();

	const defaultDate = addMonths(new Date(), 1);

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
		mode: "onTouched",
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
			const nextDate = addMonths(new Date(), 1);
			form.reset({
				startDate: new Date(
					nextDate.getFullYear(),
					nextDate.getMonth(),
					nextDate.getDate(),
					9,
					0,
					0,
				),
				endDate: new Date(
					nextDate.getFullYear(),
					nextDate.getMonth(),
					nextDate.getDate(),
					17,
					0,
					0,
				),
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
			});
			await utils.google.getAvailability.invalidate();
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

	if (isLoadingOoO && session?.user.isEvaluator) {
		return (
			<div className="flex flex-col space-y-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-24 w-full rounded-md" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<h2 className="mb-4 font-bold text-2xl">
				Declare Your {isUnavailability ? "Unavailability" : "Availability"}
			</h2>
			{IS_DEV && !session?.user.isImpersonating && (
				<OutOfOfficePriorityDevToggle
					outOfOfficePriority={outOfOfficePriority ?? false}
				/>
			)}
			<Form {...form}>
				<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
					<AvailabilityFields
						form={form}
						outOfOfficePriority={outOfOfficePriority}
					/>
					<Button
						className="w-full"
						disabled={createAvailability.isPending || !form.formState.isValid}
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
