"use client";

import { memo } from "react";
import { cn } from "~/lib/utils";
import type { SortedClient } from "~/server/lib/types";

type SelectableClientListItemProps = {
	client: SortedClient;
	isSelected?: boolean;
	onSelect: (client: SortedClient) => void;
};

function SelectableClientListItemComponent({
	client,
	isSelected,
	onSelect,
}: SelectableClientListItemProps) {
	return (
		<button
			className={cn(
				"flex w-full cursor-pointer justify-between rounded-sm p-1 text-sm transition-colors",
				isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
			)}
			onClick={() => onSelect(client)}
			type="button"
		>
			<span>{client.fullName}</span>
			<span
				className={cn(
					"text-muted-foreground text-xs",
					isSelected ? "bg-accent text-accent-foreground" : "",
				)}
			>
				{client.id}
			</span>
		</button>
	);
}

export const SelectableClientListItem = memo(SelectableClientListItemComponent);
