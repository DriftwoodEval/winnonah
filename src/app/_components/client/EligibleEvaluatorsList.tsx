"use client";

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
import { useState } from "react";
import type { ClientWithOffice } from "~/lib/types";
import { api } from "~/trpc/react";

interface EligibleEvaluatorsListProps {
	client: ClientWithOffice;
}

export function EligibleEvaluatorsList({
	client,
}: EligibleEvaluatorsListProps) {
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

	return (
		<div className="max-h-64 w-full overflow-auto rounded-md border shadow">
			<div className="flex w-full items-center justify-between bg-background p-4">
				<h4 className="sticky top-0 z-10 h-full font-bold leading-none">
					Eligible Evaluators
				</h4>
				<Select defaultValue={selectedOffice} onValueChange={setSelectedOffice}>
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
								className="h-[var(--text-sm)] w-full rounded-md"
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
	);
}
