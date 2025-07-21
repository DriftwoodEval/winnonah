"use client";

import Link from "next/link";
import { useMemo } from "react";
import { cn, formatClientAge, getColorFromMap } from "~/lib/utils";
import type { AsanaProject, SortedClient } from "~/server/lib/types";

type ClientListItemProps = {
	client: SortedClient;
	asanaProjectMap?: Map<string, AsanaProject>;
};

export function ClientListItem({
	client,
	asanaProjectMap,
}: ClientListItemProps) {
	const asanaColor = useMemo(() => {
		if (!asanaProjectMap || !client.asanaId) return null;
		const project = asanaProjectMap?.get(client.asanaId);
		return getColorFromMap(project?.color ?? "");
	}, [client.asanaId, asanaProjectMap]);
	return (
		<Link href={`/clients/${client.hash}`}>
			<div className="flex justify-between text-sm">
				<div className="flex items-center gap-2">
					{asanaColor && (
						<span
							className="h-3 w-3 rounded-full"
							style={{ backgroundColor: asanaColor }}
						/>
					)}
					<span>{client.fullName}</span>
				</div>
				<span
					className={cn(
						"text-muted-foreground",
						client.sortReason === "BabyNet above 2:6" && "text-destructive",
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
