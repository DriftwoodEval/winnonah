"use client";

import { memo } from "react";
import type { SortedClient } from "~/lib/types";
import { cn } from "~/lib/utils";

type SelectableClientListItemProps = {
	client: SortedClient;
	isSelected?: boolean;
	onSelect: (client: SortedClient) => void;
	showId?: boolean;
};

function SelectableClientListItemComponent({
	client,
	isSelected,
	onSelect,
	showId,
}: SelectableClientListItemProps) {
	return (
		<button
			className={cn(
				"flex w-full cursor-pointer items-center justify-between rounded-sm p-1 text-sm transition-colors",
				isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
			)}
			onClick={() => onSelect(client)}
			type="button"
		>
			<span>{client.fullName}</span>
			{showId && (
				<span
					className={cn(
						"text-muted-foreground text-xs",
						isSelected ? "bg-accent text-accent-foreground" : "",
					)}
				>
					{client.id}
				</span>
			)}
		</button>
	);
}

export const SelectableClientListItem = memo(SelectableClientListItemComponent);
