"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { isAfter, isBefore, parseISO } from "date-fns";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientGetOneOutput } from "~/lib/api-types";
import {
	aggregateBillingCodes,
	calculateAdditionalAppointments,
	packCodesIntoAppointments,
	parsePrecertMemo,
} from "~/lib/billing";
import { api } from "~/trpc/react";

export function AdditionalInsuranceAppointmentsDisplay({
	client,
}: {
	client: ClientGetOneOutput;
}) {
	const can = useCheckPermission();
	const canSee = can("clients:additional-insurance-appointments");
	const { data: insurances = [] } = api.insurances.getAll.useQuery();
	const { data: policiesData } = api.clients.getInsurancePolicies.useQuery(
		client.id,
	);
	const policies = policiesData?.policies ?? [];
	const [combined, setCombined] = useState(false);
	const utils = api.useUtils();

	const computeMutation = api.clients.computeAssessmentMinutes.useMutation({
		onSuccess: () => {
			void utils.clients.getOne.invalidate();
		},
	});

	const insurance = insurances.find(
		(i) =>
			i.shortName === client.primaryInsurance ||
			i.aliases.some((a) => a.name === client.primaryInsurance),
	);

	const additionalAppts = insurance?.additionalAppts as
		| {
				maxUnitsPerDay?: number;
				using90000BillingCode?: boolean;
				max96130?: number;
				max96131?: number;
				max96136?: number;
				max96137?: number;
				maxAppt4Units?: number;
		  }
		| undefined;

	const maxUnitsPerDay = additionalAppts?.maxUnitsPerDay ?? 6;
	const waitForPA = insurance?.preAuthNeeded ?? false;
	const isBabyNet =
		client.babyNet ||
		(client.primaryInsurance?.toLowerCase().includes("babynet") ?? false) ||
		(client.secondaryInsurance ?? []).some((s) =>
			s.toLowerCase().includes("babynet"),
		);
	const using90000BillingCode = additionalAppts?.using90000BillingCode ?? false;
	const snapshot = client.assessmentData;

	const activePrecertPolicy = policies
		.filter((p) => {
			if (!p.precertMemo) return false;
			if (!p.policyStartDate) return true;
			const now = new Date();
			const start =
				typeof p.policyStartDate === "string"
					? parseISO(p.policyStartDate)
					: p.policyStartDate;
			if (isBefore(now, start)) return false;
			if (!p.policyEndDate) return true;
			const end =
				typeof p.policyEndDate === "string"
					? parseISO(p.policyEndDate)
					: p.policyEndDate;
			return !isAfter(now, end);
		})
		.sort((a, b) => {
			const aDate = a.policyStartDate
				? typeof a.policyStartDate === "string"
					? parseISO(a.policyStartDate)
					: a.policyStartDate
				: new Date(0);
			const bDate = b.policyStartDate
				? typeof b.policyStartDate === "string"
					? parseISO(b.policyStartDate)
					: b.policyStartDate
				: new Date(0);
			return bDate.getTime() - aDate.getTime();
		})[0];

	const precertMemo = activePrecertPolicy?.precertMemo ?? null;
	const precertCodes = precertMemo ? parsePrecertMemo(precertMemo) : null;

	if (!canSee || !client.primaryInsurance) {
		return null;
	}

	if (!insurance) {
		return (
			<div className="w-full rounded-md border bg-card text-card-foreground shadow-sm">
				<div className="flex w-full flex-col gap-3 px-4 pt-4">
					<h4 className="font-bold leading-none">Insurance Codes</h4>
				</div>
				<div className="px-4 pt-2 pb-4 text-muted-foreground text-sm">
					Insurance not configured for billing code calculation.
				</div>
			</div>
		);
	}

	const fromPrecert = precertCodes !== null;

	const displayAppointments = fromPrecert
		? packCodesIntoAppointments(
				precertCodes,
				maxUnitsPerDay,
				additionalAppts?.maxAppt4Units,
			)
		: snapshot && snapshot.minutes > 0
			? calculateAdditionalAppointments(snapshot.minutes, maxUnitsPerDay, {
					max96130: additionalAppts?.max96130,
					max96131: additionalAppts?.max96131,
					max96136: additionalAppts?.max96136,
					max96137: additionalAppts?.max96137,
					maxAppt4Units: additionalAppts?.maxAppt4Units,
				})
			: [];

	const aggregatedCodes = aggregateBillingCodes(displayAppointments);

	const computedAt = snapshot
		? new Date(snapshot.computedAt).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;

	return (
		<div className="w-full rounded-md border bg-card text-card-foreground shadow-sm">
			<div className="flex w-full flex-col gap-3 px-4 pt-4">
				<div className="flex items-center justify-between">
					<h4 className="font-bold leading-none">Insurance Codes</h4>
					{!fromPrecert && (
						<Button
							disabled={computeMutation.isPending}
							onClick={() => computeMutation.mutate({ clientId: client.id })}
							size="sm"
							variant="outline"
						>
							{computeMutation.isPending
								? "Computing…"
								: snapshot
									? "Recompute"
									: "Compute"}
						</Button>
					)}
				</div>

				{snapshot && !fromPrecert && (
					<p className="text-muted-foreground text-xs">
						Computed {computedAt} · Age {snapshot.ageInYears} ·{" "}
						{snapshot.asdAdhd ?? "No diagnosis"} ·{" "}
						{snapshot.includedTypes.length} assessment
						{snapshot.includedTypes.length === 1 ? "" : "s"}
						{snapshot.excludedExternal.length > 0
							? ` (${snapshot.excludedExternal.length} external excluded)`
							: ""}
					</p>
				)}

				{displayAppointments.length > 0 && (
					<div className="flex gap-1">
						<Button
							onClick={() => setCombined(false)}
							size="sm"
							variant={combined ? "ghost" : "secondary"}
						>
							By Appt
						</Button>
						<Button
							onClick={() => setCombined(true)}
							size="sm"
							variant={combined ? "secondary" : "ghost"}
						>
							Combined
						</Button>
					</div>
				)}
			</div>

			{displayAppointments.length === 0 && !snapshot && (
				<div className="px-4 pt-2 pb-4 text-muted-foreground text-sm">
					Click Compute to calculate appointments based on this client's age and
					diagnosis.
				</div>
			)}

			{displayAppointments.length === 0 && snapshot && (
				<div className="px-4 pt-2 pb-4 text-muted-foreground text-sm">
					No billing appointments calculated (0 minutes from applicable
					assessments).
				</div>
			)}

			{displayAppointments.length > 0 && (
				<div className="space-y-6 p-4">
					{isBabyNet && (
						<Badge className="w-full justify-center py-1" variant="destructive">
							BABYNET
						</Badge>
					)}
					{waitForPA && (
						<Badge className="w-full justify-center py-1" variant="destructive">
							PRIOR AUTH REQUIRED
						</Badge>
					)}
					{using90000BillingCode && (
						<Badge className="w-full justify-center py-1" variant="destructive">
							USING 90000 BILLING CODE
						</Badge>
					)}
					{fromPrecert && (
						<Badge className="w-full justify-center py-1" variant="secondary">
							FROM PRE-CERTIFICATION
						</Badge>
					)}

					{combined ? (
						<div className="rounded-md border bg-background p-4 text-foreground">
							<div className="space-y-2">
								<div className="grid grid-cols-2 gap-2 font-medium text-muted-foreground text-xs uppercase">
									<div>CPT</div>
									<div className="text-right">Units</div>
								</div>
								{aggregatedCodes.map((codeObj) => (
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
					) : (
						<div className="space-y-6">
							{displayAppointments.map((appt, apptIndex) => (
								<div
									className="space-y-4 rounded-md border bg-background p-4 text-foreground"
									// biome-ignore lint/suspicious/noArrayIndexKey: This component is read-only
									key={apptIndex}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-4">
											<Label className="font-semibold">
												Appointment {apptIndex + 1}
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
													{codeObj.units}{" "}
													{codeObj.units === 1 ? "Unit" : "Units"}
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
