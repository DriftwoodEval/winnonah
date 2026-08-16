"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface EditPaAssignedToDialogProps {
	clientId: number;
	value: string;
	setOpen: Dispatch<SetStateAction<boolean>>;
}

export function EditPaAssignedToDialog({
	clientId,
	value,
	setOpen,
}: EditPaAssignedToDialogProps) {
	const utils = api.useUtils();
	const [paAssignedTo, setPaAssignedTo] = useState(value);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const updatePaAssignedTo = api.google.setPaAssignedTo.useMutation({
		onSuccess: () => {
			toast.success("PA Assigned To updated successfully");
			// PA Assigned To is stored on clients.paAssignedTo (kept in sync with
			// the Punchlist), so refresh the DB-backed reads alongside the sheet.
			utils.clients.getOne.invalidate();
			utils.clients.directory.invalidate();
			utils.google.getClientFromPunch.invalidate(clientId.toString());
			utils.google.getPunch.invalidate();
			setOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to update PA Assigned To", {
				description: error.message,
			});
		},
		onSettled: () => {
			setIsSubmitting(false);
		},
	});

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		updatePaAssignedTo.mutate({ clientId, paAssignedTo });
	}

	return (
		<form className="space-y-4" onSubmit={onSubmit}>
			<Input
				onChange={(e) => setPaAssignedTo(e.target.value)}
				placeholder="Who's assigned?"
				value={paAssignedTo}
			/>
			<div className="flex justify-end gap-2">
				<Button
					disabled={isSubmitting}
					onClick={() => setOpen(false)}
					type="button"
					variant="outline"
				>
					Cancel
				</Button>
				<Button disabled={isSubmitting || paAssignedTo === value} type="submit">
					Save
				</Button>
			</div>
		</form>
	);
}
