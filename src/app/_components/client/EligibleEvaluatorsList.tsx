"use client";

import { api } from "~/trpc/react";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";

interface EligibleEvaluatorsListProps {
	clientId: number | undefined;
}

export function EligibleEvaluatorsList({
	clientId,
}: EligibleEvaluatorsListProps) {
	const { data: eligibleEvaluators, isLoading: isLoadingEvaluators } =
		api.evaluators.getEligibleForClient.useQuery(clientId ?? 0, {
			enabled: typeof clientId === "number" && clientId > 0,
		});

	return (
		<div className="max-h-52 w-full overflow-auto rounded-md border shadow">
			<h4 className="sticky top-0 z-10 h-full w-full bg-background p-4 font-bold leading-none">
				Eligible Evaluators
			</h4>
			<ScrollArea className="p-4">
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
				) : eligibleEvaluators && eligibleEvaluators.length > 0 ? (
					eligibleEvaluators.map((evaluator, index) => (
						<div key={evaluator.npi}>
							<div className="text-sm">{evaluator.providerName}</div>
							{index !== eligibleEvaluators.length - 1 && (
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
