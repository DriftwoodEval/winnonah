"use client";

import { Badge } from "@ui/badge";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { Client } from "~/lib/models";
import { api } from "~/trpc/react";

export function AdditionalInsuranceAppointmentsDisplay({
	client,
}: {
	client: Client;
}) {
	const can = useCheckPermission();
	const canSee = can("clients:additional-insurance-appointments");
	const insurances = api.insurances.getAll.useQuery().data ?? [];

	const insurance = insurances.find(
		(i) =>
			i.shortName === client.primaryInsurance ||
			i.aliases.some((a) => a.name === client.primaryInsurance),
	);

	const displayData = insurance?.additionalAppts;

	if (!displayData || displayData.appointments.length === 0 || !canSee)
		return null;

	return (
		<div className="w-full rounded-md border shadow">
			<div className="flex w-full items-center justify-between bg-background px-4 pt-4">
				<h4 className="top-0 h-full font-bold leading-none">
					Additional Insurance Appointments
				</h4>
			</div>

			<div className="space-y-6 p-4">
				{displayData.waitForPA && (
					<Badge className="w-full justify-center py-1" variant="destructive">
						PRIOR AUTHORIZATION REQUIRED
					</Badge>
				)}

				<div className="space-y-6">
					{displayData.appointments.map((appt, apptIndex) => (
						<div
							className="space-y-4 rounded-md border bg-card p-4"
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
										<div className="font-mono text-sm">
											{codeObj.code || "No Code Provided"}
										</div>
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
