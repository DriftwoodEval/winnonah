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
import type { Client } from "~/lib/types";

type Props = {
	client: Client;
};

export function AutismStopAlert({ client }: Props) {
	const VISIT_DATA_KEY = `visitData:${client.hash}`;

	const [isAutismRecordsWarningOpen, setIsAutismRecordsWarningOpen] =
		useState(false);

	useEffect(() => {
		const storedData = localStorage.getItem(VISIT_DATA_KEY);
		const now = Date.now();

		let visitData = { count: 0, timestamp: now };

		if (storedData) {
			visitData = JSON.parse(storedData);
			if (now - visitData.timestamp > 7 * 24 * 60 * 60 * 1000) {
				visitData.count = 0;
			}
		}

		if (visitData.count < 6 && client.autismStop) {
			visitData.count += 1;
			visitData.timestamp = now;
			localStorage.setItem(VISIT_DATA_KEY, JSON.stringify(visitData));
			setIsAutismRecordsWarningOpen(true);
		}
	}, [client?.autismStop, VISIT_DATA_KEY]);

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
