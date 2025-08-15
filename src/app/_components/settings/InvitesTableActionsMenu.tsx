"use client";

import { Button } from "@ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";

import { MoreHorizontal } from "lucide-react";
import type { Invitation } from "~/server/lib/types";
import { api } from "~/trpc/react";

export function InvitesTableActionsMenu({ invite }: { invite: Invitation }) {
	const utils = api.useUtils();

	const { mutate: deleteInvite, isPending: isUpdating } =
		api.users.deleteInvitation.useMutation({
			onSuccess: () => {
				utils.users.getPendingInvitations.invalidate();
			},
			onError: (error) => console.error("Failed to update:", error),
		});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="h-8 w-8 p-0" variant="ghost">
					<span className="sr-only">Open menu</span>
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuItem onClick={() => deleteInvite({ id: invite.id })}>
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
