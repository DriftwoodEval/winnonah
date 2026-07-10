"use client";

import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { HelpCircle } from "lucide-react";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientGetOneOutput } from "~/lib/api-types";
import { api } from "~/trpc/react";

interface EligibleEvaluatorsListProps {
	client: ClientGetOneOutput;
}

function statusClass(ok: boolean, positiveClass = "text-muted-foreground") {
	return `${ok ? positiveClass : "text-error"} text-xs`;
}

export function EligibleEvaluatorsList({
	client,
}: EligibleEvaluatorsListProps) {
	const checkPermission = useCheckPermission();
	const canViewDebug = checkPermission("settings:evaluators");
	const [showDebug, setShowDebug] = useState(false);

	const { data: eligibleEvaluators, isLoading: isLoadingEvaluators } =
		api.evaluators.getEligibleForClient.useQuery(client.id ?? 0, {
			enabled: typeof client.id === "number" && client.id > 0,
		});
	const { data: offices } = api.offices.getAll.useQuery();
	const closestOffices = client.closestOffices || [];
	const initialOfficeKey = closestOffices[0]?.key ?? "all";
	const [selectedOffice, setSelectedOffice] =
		useState<string>(initialOfficeKey);

	const filteredEvaluators = eligibleEvaluators?.filter((evaluator) => {
		if (selectedOffice === "all") return true;
		return evaluator.offices.some((office) => office.key === selectedOffice);
	});

	const { data: debugData, isLoading: isLoadingDebug } =
		api.evaluators.getEligibilityDebug.useQuery(client.id ?? 0, {
			enabled: showDebug && typeof client.id === "number" && client.id > 0,
		});

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="max-h-64 w-full overflow-auto rounded-md border shadow-sm">
				<div className="flex w-full items-center justify-between bg-background p-4">
					<h4 className="sticky top-0 z-10 h-full font-bold leading-none">
						Eligible Evaluators
					</h4>
					<Select
						defaultValue={selectedOffice}
						onValueChange={setSelectedOffice}
					>
						<SelectTrigger>
							<SelectValue placeholder="Filter by office" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem key="all" value="all">
								All Offices
							</SelectItem>
							{offices?.map((office) => (
								<SelectItem key={office.key} value={office.key}>
									{office.prettyName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<ScrollArea className="px-4 pb-4">
					{isLoadingEvaluators ? (
						<div className="flex flex-col gap-2">
							{[...Array(5)].map((_, i) => (
								<Skeleton
									className="h-(--text-sm) w-full rounded-md"
									key={`skeleton-evaluator-${
										// biome-ignore lint/suspicious/noArrayIndexKey: Skeletons can have array based keys
										i
									}`}
								/>
							))}
						</div>
					) : filteredEvaluators && filteredEvaluators.length > 0 ? (
						filteredEvaluators.map((evaluator, index) => (
							<div key={evaluator.npi}>
								<div className="text-sm">{evaluator.providerName}</div>
								{index !== filteredEvaluators.length - 1 && (
									<Separator className="my-2" />
								)}
							</div>
						))
					) : (
						<p className="text-muted-foreground text-sm">
							No eligible evaluators found.
						</p>
					)}
				</ScrollArea>
			</div>

			{canViewDebug && !isLoadingEvaluators && (
				<Button
					className="w-fit"
					onClick={() => setShowDebug((prev) => !prev)}
					size="sm"
					variant={showDebug ? "secondary" : "outline"}
				>
					<HelpCircle className="mr-1 h-4 w-4" />
					{showDebug ? "Hide eligibility details" : "Why?"}
				</Button>
			)}

			{showDebug && (
				<div className="max-h-96 w-full overflow-auto rounded-md border p-4 text-sm shadow-sm">
					{isLoadingDebug ? (
						<Skeleton className="h-(--text-sm) w-full rounded-md" />
					) : !debugData ? (
						<p className="text-muted-foreground text-sm">
							No eligibility details available.
						</p>
					) : (
						<div className="flex flex-col gap-3">
							<div className="text-muted-foreground text-xs">
								{debugData.clientContext.isPrivatePay ? (
									<p>Client is private pay, so insurance is not a factor.</p>
								) : (
									<p>
										Client insurances:{" "}
										{debugData.clientContext.standardizedInsurances.join(
											", ",
										) || "none on file"}
									</p>
								)}
								{debugData.clientContext.districtCheckSkipped ? (
									<p>
										{debugData.clientContext.districtSkipReason ??
											"District restrictions do not apply."}
									</p>
								) : (
									<p>
										School district: {debugData.clientContext.schoolDistrict}{" "}
										(zip {debugData.clientContext.zip})
									</p>
								)}
							</div>
							<Separator />
							{debugData.evaluators.map((evaluator, index) => (
								<div key={evaluator.npi}>
									<div className="flex items-center justify-between gap-2">
										<span className="font-medium">{evaluator.name}</span>
										<span
											className={statusClass(
												evaluator.eligible,
												"text-success",
											)}
										>
											{evaluator.eligible ? "Eligible" : "Ineligible"}
										</span>
									</div>
									<p className={statusClass(evaluator.insuranceEligible)}>
										{evaluator.insuranceReason}
									</p>
									<p className={statusClass(evaluator.districtEligible)}>
										{evaluator.districtReason}
									</p>
									{index !== debugData.evaluators.length - 1 && (
										<Separator className="my-2" />
									)}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
