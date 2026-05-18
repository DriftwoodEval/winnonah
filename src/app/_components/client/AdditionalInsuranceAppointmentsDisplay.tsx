"use client";

import { Badge } from "@ui/badge";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientGetOneOutput } from "~/lib/api-types";
import { calculateAdditionalAppointments } from "~/lib/billing";
import { api } from "~/trpc/react";

export function AdditionalInsuranceAppointmentsDisplay({
	client,
}: {
	client: ClientGetOneOutput;
}) {
	const can = useCheckPermission();
	const canSee = can("clients:additional-insurance-appointments");
	const { data: insurances = [] } = api.insurances.getAll.useQuery();

	const insurance = insurances.find(
		(i) =>
			i.shortName === client.primaryInsurance ||
			i.aliases.some((a) => a.name === client.primaryInsurance),
	);

	const additionalAppts = insurance?.additionalAppts as
		| {
				maxUnitsPerDay?: number;
				waitForPA?: boolean;
				max96130?: number;
				max96131?: number;
				max96136?: number;
				max96137?: number;
		  }
		| undefined;

	const maxUnitsPerDay = additionalAppts?.maxUnitsPerDay;
	const waitForPA = additionalAppts?.waitForPA ?? false;

	const appointments =
		maxUnitsPerDay && client.totalAssessmentMinutes > 0
			? calculateAdditionalAppointments(
					client.totalAssessmentMinutes,
					maxUnitsPerDay,
					{
						max96130: additionalAppts?.max96130,
						max96131: additionalAppts?.max96131,
						max96136: additionalAppts?.max96136,
						max96137: additionalAppts?.max96137,
					},
				)
			: [];

	if (!canSee || !client.primaryInsurance || appointments.length === 0) {
		return null;
	}

	return (
		<div className="w-full rounded-md border bg-card text-card-foreground shadow">
			<div className="flex w-full items-center justify-between px-4 pt-4">
				<h4 className="top-0 h-full font-bold leading-none">
					Insurance Codes by Appointment
				</h4>
			</div>

			<div className="space-y-6 p-4">
				{waitForPA && (
					<Badge className="w-full justify-center py-1" variant="destructive">
						PRIOR AUTHORIZATION REQUIRED
					</Badge>
				)}

				<div className="space-y-6">
					{appointments.map((appt, apptIndex) => (
						<div
							className="space-y-4 rounded-md border bg-background p-4 text-foreground"
							// biome-ignore lint/suspicious/noArrayIndexKey: This component is read-only
							key={apptIndex}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-4">
									<Label className="font-semibold">
										Appointment {apptIndex + 2}
									</Label>
								</div>
							</div>

							<Separator />

							<div className="space-y-2">
								<div className="grid grid-cols-2 gap-2 font-medium text-muted-foreground text-xs uppercase">
									<div>CPT</div>
									<div className="text-right">Units</div>
								</div>

								{appt.codes.map((codeObj) => (
									<div
										className="grid grid-cols-2 items-center gap-2"
										key={codeObj.code}
									>
										<div className="font-mono text-sm">{codeObj.code}</div>
										<div className="text-right text-sm">
											{codeObj.units} {codeObj.units === 1 ? "Unit" : "Units"}
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
