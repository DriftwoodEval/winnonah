"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Badge } from "@ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import type { Client } from "~/lib/models";
import { formatPhoneNumber, toTitleCase } from "~/lib/utils";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import { InsuranceReviewSection } from "./InsuranceReviewSection";

interface InsuranceTabProps {
	client: Client;
}

function formatDate(dateVal: Date | string | null | undefined): string {
	if (!dateVal) return "—";
	try {
		const d = typeof dateVal === "string" ? parseISO(dateVal) : dateVal;
		return format(d, "MM/dd/yyyy");
	} catch {
		return String(dateVal);
	}
}

function isActive(
	startDate: Date | string | null | undefined,
	endDate: Date | string | null | undefined,
): boolean {
	const now = new Date();
	if (!startDate) return false;
	const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
	if (isBefore(now, start)) return false;
	if (!endDate) return true;
	const end = typeof endDate === "string" ? parseISO(endDate) : endDate;
	return !isAfter(now, end);
}

function InfoRow({
	label,
	value,
}: {
	label: string;
	value: string | null | undefined;
}) {
	if (!value) return null;
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="text-sm">{value}</span>
		</div>
	);
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<p className="mt-3 mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{children}
		</p>
	);
}

type Policy =
	inferRouterOutputs<AppRouter>["clients"]["getInsurancePolicies"]["policies"][number];

function PolicyCard({
	policy,
	medicaidEligibility,
}: {
	policy: Policy;
	medicaidEligibility?: {
		qualCategory: string | null;
		paymentCategory: string | null;
	};
}) {
	const active = isActive(policy.policyStartDate, policy.policyEndDate);
	const companyName =
		policy.insuranceCompanyName ?? policy.policyCompanyName ?? null;

	return (
		<Card className="w-full">
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-2">
					<div>
						<CardTitle className="text-base">
							{companyName ?? "Unknown Company"}
						</CardTitle>
						{policy.planName && (
							<CardDescription>{policy.planName}</CardDescription>
						)}
					</div>
					<div className="flex shrink-0 flex-wrap gap-1.5">
						{policy.policyType && (
							<Badge variant="outline">{policy.policyType}</Badge>
						)}
						{policy.privatePay && (
							<Badge variant="secondary">Private Pay</Badge>
						)}
						<Badge variant={active ? "default" : "secondary"}>
							{active ? "Active" : "Inactive"}
						</Badge>
					</div>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
					<InfoRow label="Policy #" value={policy.insuranceNumber} />
					<InfoRow label="Group #" value={policy.groupNumber} />
					<InfoRow label="Payer ID" value={policy.insurancePayerId} />
					<InfoRow
						label="Start Date"
						value={formatDate(policy.policyStartDate)}
					/>
					<InfoRow label="End Date" value={formatDate(policy.policyEndDate)} />
					<InfoRow label="Employer" value={policy.employer} />
					<InfoRow
						label="Phone"
						value={
							formatPhoneNumber(
								policy.insurancePhone ?? policy.policyCompanyPhone ?? "",
							) || null
						}
					/>
					<InfoRow
						label="Precert Phone"
						value={
							policy.insurancePrecertPhone
								? formatPhoneNumber(policy.insurancePrecertPhone)
								: null
						}
					/>
					<InfoRow label="Website" value={policy.insuranceWebsite} />
					<InfoRow
						label="Insurance Type"
						value={policy.insuranceType && toTitleCase(policy.insuranceType)}
					/>
				</div>

				{(policy.insuredFirstName ??
					policy.insuredLastName ??
					policy.insuredRelation) && (
					<>
						<SectionHeader>Insured</SectionHeader>
						<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
							<InfoRow
								label="Name"
								value={
									[
										policy.insuredFirstName,
										policy.insuredMiddleName,
										policy.insuredLastName,
									]
										.filter(Boolean)
										.join(" ") || null
								}
							/>
							<InfoRow label="Relationship" value={policy.insuredRelation} />
							<InfoRow label="DOB" value={formatDate(policy.insuredDob)} />
							<InfoRow label="Gender" value={policy.insuredGender} />
							<InfoRow
								label="Phone"
								value={
									policy.insuredPhone
										? formatPhoneNumber(policy.insuredPhone)
										: null
								}
							/>
						</div>
					</>
				)}

				{(policy.deductible ??
					policy.copayAmount ??
					policy.copayPercent ??
					policy.paysAt) && (
					<>
						<SectionHeader>Benefits</SectionHeader>
						<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
							<InfoRow label="Deductible" value={policy.deductible} />
							<InfoRow label="Deductible Met" value={policy.deductibleMet} />
							<InfoRow label="Pays At" value={policy.paysAt} />
							<InfoRow
								label="Copay"
								value={
									policy.isCopay
										? (policy.copayAmount ?? policy.copayPercent ?? "Yes")
										: null
								}
							/>
							<InfoRow
								label="Precert Required"
								value={
									policy.precertRequired != null
										? policy.precertRequired
											? "Yes"
											: "No"
										: null
								}
							/>
							<InfoRow label="Treat Frequency" value={policy.treatFrequency} />
							<InfoRow label="Auth #" value={policy.benefitsAuthNumber} />
							<InfoRow
								label="Auth Date"
								value={formatDate(policy.benefitsAuthDate)}
							/>
							<InfoRow label="Spoke To" value={policy.benefitsSpokeTO} />
							<InfoRow label="CPT" value={policy.benefitsCpt} />
						</div>
					</>
				)}

				{(policy.precertExpireDate ??
					policy.precertAuthNumber ??
					policy.precertVisitAllowed) && (
					<>
						<SectionHeader>Pre-Certification</SectionHeader>
						<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
							<InfoRow
								label="Start Date"
								value={formatDate(policy.precertStartDate)}
							/>
							<InfoRow
								label="Expire Date"
								value={formatDate(policy.precertExpireDate)}
							/>
							<InfoRow
								label="Visits Allowed"
								value={policy.precertVisitAllowed}
							/>
							<InfoRow label="Visits Used" value={policy.precertVisitUsed} />
							<InfoRow label="Auth #" value={policy.precertAuthNumber} />
							<InfoRow
								label="Auth Date"
								value={formatDate(policy.precertAuthDate)}
							/>
							<InfoRow label="Spoke To" value={policy.precertSpokeTO} />
							<InfoRow label="CPT" value={policy.precertCpt} />
						</div>
						{policy.precertMemo && (
							<p className="mt-2 text-muted-foreground text-sm">
								{policy.precertMemo}
							</p>
						)}
					</>
				)}

				{(policy.memo ?? policy.clientMemo) && (
					<>
						<SectionHeader>Notes</SectionHeader>
						{policy.memo && <p className="text-sm">{policy.memo}</p>}
						{policy.clientMemo && policy.clientMemo !== policy.memo && (
							<p className="text-muted-foreground text-sm">
								{policy.clientMemo}
							</p>
						)}
					</>
				)}

				{(medicaidEligibility?.qualCategory ??
					medicaidEligibility?.paymentCategory) && (
					<>
						<SectionHeader>Medicaid Eligibility</SectionHeader>
						<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
							<InfoRow
								label="Qual. Category"
								value={medicaidEligibility?.qualCategory}
							/>
							<InfoRow
								label="Payment Category"
								value={medicaidEligibility?.paymentCategory}
							/>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export function InsuranceTab({ client }: InsuranceTabProps) {
	const clientId = client.id;
	const { data, isLoading } =
		api.clients.getInsurancePolicies.useQuery(clientId);

	const policies = data?.policies ?? [];
	const scmAliasNames = data?.scmAliasNames ?? [];
	const isScmClient =
		!!client.primaryInsurance &&
		scmAliasNames.includes(client.primaryInsurance);

	const scmPolicyId = isScmClient
		? policies.find((p) => p.policyType?.toUpperCase() === "PRIMARY")?.policyId
		: undefined;

	const active = policies.filter((p) =>
		isActive(p.policyStartDate, p.policyEndDate),
	);
	const inactive = policies.filter(
		(p) => !isActive(p.policyStartDate, p.policyEndDate),
	);

	return (
		<div className="flex w-full flex-col gap-4">
			<InsuranceReviewSection client={client} />
			{isLoading ? (
				[1, 2].map((i) => (
					<div
						className="h-40 w-full animate-pulse rounded-lg bg-muted"
						key={i}
					/>
				))
			) : !policies.length ? (
				<p className="text-center text-muted-foreground text-sm">
					No insurance policies found.
				</p>
			) : (
				<>
					{active.map((policy) => (
						<PolicyCard
							key={policy.policyId}
							medicaidEligibility={
								policy.policyId === scmPolicyId
									? {
											qualCategory: client.qualCategory ?? null,
											paymentCategory: client.paymentCategory ?? null,
										}
									: undefined
							}
							policy={policy}
						/>
					))}
					{inactive.length > 0 && (
						<>
							{active.length > 0 && (
								<p className="font-medium text-muted-foreground text-sm">
									Inactive Policies
								</p>
							)}
							{inactive.map((policy) => (
								<PolicyCard
									key={policy.policyId}
									medicaidEligibility={
										policy.policyId === scmPolicyId
											? {
													qualCategory: client.qualCategory ?? null,
													paymentCategory: client.paymentCategory ?? null,
												}
											: undefined
									}
									policy={policy}
								/>
							))}
						</>
					)}
				</>
			)}
		</div>
	);
}
