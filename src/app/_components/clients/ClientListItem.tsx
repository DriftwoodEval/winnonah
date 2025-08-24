"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getHexFromColor } from "~/lib/colors";
import { cn, formatClientAge } from "~/lib/utils";
import type { SortedClient } from "~/server/lib/types";

type ClientListItemProps = {
	client: SortedClient;
};

export function ClientListItem({ client }: ClientListItemProps) {
	const clientHexColor = useMemo(() => {
		return client.color ? getHexFromColor(client.color) : undefined;
	}, [client.color]);
	return (
		<Link href={`/clients/${client.hash}`}>
			<div className="flex justify-between text-sm">
				<div className="flex items-center gap-2">
					{client.color && client.color !== "none" && clientHexColor && (
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
							client.sortReason === "High Priority") &&
							"text-destructive",
					)}
				>
					<span className="font-bold text-muted-foreground">
						{client.interpreter ? "Interpreter " : ""}
					</span>
					{client.sortReason === "BabyNet above 2:6"
						? `BabyNet: ${formatClientAge(new Date(client.dob), "short")}`
						: client.sortReason === "Added date"
							? `Added: ${client.addedDate?.toLocaleDateString("en-US", {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}`
							: client.sortReason}
				</span>
			</div>
		</Link>
	);
}
