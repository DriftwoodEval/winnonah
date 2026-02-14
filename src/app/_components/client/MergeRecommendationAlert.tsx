"use client";

import { MergePreviewDialog } from "@components/clients/MergePreviewDialog";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { GitMerge } from "lucide-react";
import type { Client } from "~/lib/models";
import { isShellClientId } from "~/lib/utils";
import { api } from "~/trpc/react";

interface MergeRecommendationAlertProps {
	client: Client;
	readOnly?: boolean;
}

export function MergeRecommendationAlert({
	client,
	readOnly,
}: MergeRecommendationAlertProps) {
	const { data: mergeSuggestions, isLoading } =
		api.clients.getMergeSuggestions.useQuery();

	if (isLoading || !mergeSuggestions || readOnly) return null;

	if (isShellClientId(client.id)) {
		const suggestion = mergeSuggestions.find(
			(s) => s.noteOnlyClient.id === client.id,
		);
		if (!suggestion || suggestion.suggestedRealClients.length === 0)
			return null;

		return (
			<Alert
				className="border-accent/20 bg-accent/5 text-accent-foreground"
				variant="default"
			>
				<GitMerge className="h-4 w-4" />
				<AlertTitle className="text-accent-foreground">
					Merge Recommendation
				</AlertTitle>
				<AlertDescription className="text-accent-goreground/90">
					<div className="mt-2 flex flex-wrap gap-2">
						{suggestion.suggestedRealClients.map((real) => (
							<MergePreviewDialog
								fakeClient={client}
								key={real.id}
								realClient={real}
								shouldRedirect
							>
								<Button className="h-7 text-xs" size="sm" variant="outline">
									Merge with {real.fullName} ({real.id})
								</Button>
							</MergePreviewDialog>
						))}
					</div>
				</AlertDescription>
			</Alert>
		);
	}

	// Real client, look for noteOnly clients that suggest this one
	const noteOnlySuggestions = mergeSuggestions.filter((s) =>
		s.suggestedRealClients.some((real) => real.id === client.id),
	);

	if (noteOnlySuggestions.length === 0) return null;

	return (
		<Alert
			className="border-accent/20 bg-accent/5 text-accent-forgeound"
			variant="default"
		>
			<GitMerge className="h-4 w-4" />
			<AlertTitle className="text-accent-foreground">
				Merge Recommendation
			</AlertTitle>
			<AlertDescription className="text-accent-foreground/90">
				A "Shell" client seems very similar to this one:
				<div className="mt-2 flex flex-wrap gap-2">
					{noteOnlySuggestions.map((s) => (
						<MergePreviewDialog
							fakeClient={s.noteOnlyClient}
							key={s.noteOnlyClient.id}
							realClient={client}
							shouldRedirect
						>
							<Button className="h-7 text-xs" size="sm" variant="outline">
								Merge {s.noteOnlyClient.fullName} into this client
							</Button>
						</MergePreviewDialog>
					))}
				</div>
			</AlertDescription>
		</Alert>
	);
}
