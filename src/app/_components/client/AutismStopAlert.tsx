"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { Client } from "~/server/lib/types";

type Props = {
	client: Client;
};

export function AutismStopAlert({ client }: Props) {
	const VISIT_COUNT_KEY = `visitCount:${client.hash}`;

	const [isAutismRecordsWarningOpen, setIsAutismRecordsWarningOpen] =
		useState(false);

	useEffect(() => {
		const visitCount = parseInt(
			localStorage.getItem(VISIT_COUNT_KEY) || "0",
			10,
		);

		if (visitCount < 6 && client.autismStop) {
			localStorage.setItem(VISIT_COUNT_KEY, (visitCount + 1).toString());
			setIsAutismRecordsWarningOpen(true);
		}
	}, [client?.autismStop, VISIT_COUNT_KEY]);

	return (
		<>
			{client.autismStop && (
				<Alert className="bg-destructive text-destructive-foreground">
					<FileText />
					<AlertTitle>"Autism" in Records</AlertTitle>
					<AlertDescription className="text-destructive-foreground/90">
						Records suggest this client has already been identified. If this is
						incorrect, please let Andrew know.
					</AlertDescription>
				</Alert>
			)}

			<Dialog
				onOpenChange={setIsAutismRecordsWarningOpen}
				open={isAutismRecordsWarningOpen}
			>
				<DialogContent className="bg-destructive text-destructive-foreground">
					<DialogHeader>
						<DialogTitle>"Autism" in Records</DialogTitle>
						<DialogDescription className="text-destructive-foreground">
							Records suggest this client has already been identified. If this
							is incorrect, please let Andrew know.
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</>
	);
}
