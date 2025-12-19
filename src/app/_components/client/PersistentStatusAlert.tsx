"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
	// Unique key for localStorage
	slug: string;
	// Unique identifier for the client/subject of alert
	identifier: string;
	// Whether to show the alert
	condition: boolean;
	title: string;
	description: string;
	icon: LucideIcon;
	// How many times the Dialog should pop up before stopping (default: 6)
	maxPopups?: number;
	variant?: "default" | "destructive";
};

export function PersistentStatusAlert({
	slug,
	identifier,
	condition,
	title,
	description,
	icon: Icon,
	maxPopups = 6,
	variant = "destructive",
}: Props) {
	const STORAGE_KEY = `alert:${slug}:${identifier}`;
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	useEffect(() => {
		if (!condition) return;

		const storedData = localStorage.getItem(STORAGE_KEY);
		const now = Date.now();
		const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

		let visitData = { count: 0, timestamp: now };

		if (storedData) {
			try {
				visitData = JSON.parse(storedData);
				// Reset count if the data is older than a week
				if (now - visitData.timestamp > ONE_WEEK) {
					visitData.count = 0;
				}
			} catch (e) {
				console.error("Failed to parse alert storage data", e);
			}
		}

		if (visitData.count < maxPopups) {
			visitData.count += 1;
			visitData.timestamp = now;
			localStorage.setItem(STORAGE_KEY, JSON.stringify(visitData));
			setIsDialogOpen(true);
		}
	}, [condition, STORAGE_KEY, maxPopups]);

	if (!condition) return null;

	const variantStyles =
		variant === "destructive"
			? "bg-destructive text-destructive-foreground"
			: "";

	return (
		<>
			<Alert className={variantStyles} variant={variant}>
				<Icon className="h-4 w-4" />
				<AlertTitle>{title}</AlertTitle>
				<AlertDescription className="text-destructive-foreground/90!">
					{description}
				</AlertDescription>
			</Alert>

			<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
				<DialogContent className={variantStyles}>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription
							className={
								variant === "destructive" ? "text-destructive-foreground" : ""
							}
						>
							{description}
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</>
	);
}
