"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import { getHexFromColor } from "~/lib/colors";
import { cn, formatClientAge } from "~/lib/utils";
import type { SortedClient } from "~/server/lib/types";

type ClientListItemProps = {
	client: SortedClient;
	isHighlighted?: boolean;
};

function ClientListItemComponent({
	client,
	isHighlighted,
}: ClientListItemProps) {
	const clientHexColor = useMemo(() => {
		return client.color ? getHexFromColor(client.color) : undefined;
	}, [client.color]);

	let sortReason = client.sortReason;

	if (client.sortReason === "Added date") {
		sortReason = `Added: ${client.addedDate?.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		})}`;
	}

	if (client.sortReason === "BabyNet above 2:6") {
		sortReason = `BabyNet: ${formatClientAge(new Date(client.dob), "short")}`;
	}

	if (client.sortReason === "BabyNet and High Priority") {
		sortReason = `High Priority, BabyNet: ${formatClientAge(new Date(client.dob), "short")}`;
	}

	if (client.sortReason === "Expiration date") {
		sortReason = `Expires: ${client.precertExpires?.toLocaleDateString(
			"en-US",
			{
				year: "numeric",
				month: "short",
				day: "numeric",
				timeZone: "UTC",
			},
		)}`;
	}

	return (
		<Link href={`/clients/${client.hash}`}>
			<div
				className={cn(
					"flex items-center justify-between text-sm",
					isHighlighted && "bg-muted/50",
				)}
			>
				<div className="flex items-center gap-2">
					{client.color && clientHexColor && (
						<span
							className="h-3 w-3 rounded-full"
							style={{ backgroundColor: clientHexColor }}
						/>
					)}
					<span>{client.fullName}</span>
				</div>
				<span
					className={cn(
						"flex gap-2 text-muted-foreground text-xs",
						(client.sortReason === "BabyNet above 2:6" ||
							client.sortReason === "High Priority" ||
							client.sortReason === "BabyNet and High Priority") &&
							"text-destructive",
					)}
				>
					{client.interpreter && (
						<span className="font-bold text-muted-foreground">Interpreter</span>
					)}

					{sortReason}
				</span>
			</div>
		</Link>
	);
}

export const ClientListItem = memo(ClientListItemComponent);
