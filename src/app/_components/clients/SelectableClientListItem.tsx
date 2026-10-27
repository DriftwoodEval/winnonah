"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Redact } from "@components/redaction/Redact";
import { forwardRef, memo } from "react";
import type { SortedClient } from "~/lib/api-types";
import { cn } from "~/lib/utils";

type SelectableClientListItemProps = {
	client: SortedClient;
	isSelected?: boolean;
	onSelect: (client: SortedClient) => void;
	showId?: boolean;
};

const SelectableClientListItemComponent = forwardRef<
	HTMLButtonElement,
	SelectableClientListItemProps
>(({ client, isSelected, onSelect, showId }, ref) => {
	return (
		<button
			className={cn(
				"flex w-full cursor-pointer items-center justify-between rounded-sm p-1 text-sm transition-colors",
				isSelected
					? "bg-secondary text-secondary-foreground"
					: "hover:bg-muted/50",
			)}
			onClick={() => onSelect(client)}
			ref={ref}
			type="button"
		>
			<span>
				<ClientHoverCard clientHash={client.hash}>
					<Redact>{client.fullName}</Redact>
				</ClientHoverCard>
			</span>
			{showId && (
				<span
					className={cn(
						"text-xs text-muted-foreground",
						isSelected ? "bg-secondary text-secondary-foreground" : "",
					)}
				>
					<Redact>{String(client.id)}</Redact>
				</span>
			)}
		</button>
	);
});

SelectableClientListItemComponent.displayName = "SelectableClientListItem";

export const SelectableClientListItem = memo(SelectableClientListItemComponent);
