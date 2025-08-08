"use client";

import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";

import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { User } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { UsersTableForm, type UsersTableFormValues } from "./UsersTableForm";

export function UsersTableActionsMenu({ user }: { user: User }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { mutate: updateUser, isPending: isUpdating } =
		api.users.updateUser.useMutation({
			onSuccess: () => {
				setIsEditDialogOpen(false);
			},
			onError: (error) => console.error("Failed to update:", error),
		});

	const handleEditSubmit = (values: UsersTableFormValues) => {
		updateUser({
			userId: user.id,
			...values,
		});
		window.location.reload();
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<span className="sr-only">Open menu</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit User</DialogTitle>
					</DialogHeader>
					<UsersTableForm
						initialData={user}
						isLoading={isUpdating}
						onFinished={() => setIsEditDialogOpen(false)}
						onSubmit={handleEditSubmit}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
