"use client";

import { MergePreviewDialog } from "@components/clients/MergePreviewDialog";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { GitMerge } from "lucide-react";
import type { Client } from "~/lib/models";
import { isNotesOnlyClientId } from "~/lib/utils";
import { api } from "~/trpc/react";

interface MergeRecommendationAlertProps {
	client: Client;
	readOnly?: boolean;
}

export function MergeRecommendationAlert({
	client,
	readOnly,
}: MergeRecommendationAlertProps) {
	const { data, isLoading } = api.clients.getMergeSuggestionsForClient.useQuery(
		{ clientId: client.id },
	);

	if (isLoading || !data || readOnly) return null;

	if (isNotesOnlyClientId(client.id)) {
		if (data.suggestedRealClients.length === 0) return null;

		return (
			<Alert
				className="border-secondary/20 bg-secondary/5 text-foreground"
				variant="default"
			>
				<GitMerge className="h-4 w-4" />
				<AlertTitle className="text-foreground">
					Merge Recommendation
				</AlertTitle>
				<AlertDescription className="text-foreground/90">
					<div className="mt-2 flex flex-wrap gap-2">
						{data.suggestedRealClients.map((real) => (
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

	if (data.suggestedNotesOnlyClients.length === 0) return null;

	return (
		<Alert
			className="border-secondary/20 bg-secondary/5 text-foreground"
			variant="default"
		>
			<GitMerge className="h-4 w-4" />
			<AlertTitle className="text-foreground">Merge Recommendation</AlertTitle>
			<AlertDescription className="text-foreground/90">
				A Notes Only client seems very similar to this one:
				<div className="mt-2 flex flex-wrap gap-2">
					{data.suggestedNotesOnlyClients.map((notesOnly) => (
						<MergePreviewDialog
							fakeClient={notesOnly}
							key={notesOnly.id}
							realClient={client}
							shouldRedirect
						>
							<Button className="h-7 text-xs" size="sm" variant="outline">
								Merge {notesOnly.fullName} into this client
							</Button>
						</MergePreviewDialog>
					))}
				</div>
			</AlertDescription>
		</Alert>
	);
}
