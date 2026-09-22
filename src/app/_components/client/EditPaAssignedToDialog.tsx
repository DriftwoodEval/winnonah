"use client";

import { Button } from "@ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface EditPaAssignedToDialogProps {
	clientId: number;
	value: string;
	setOpen: Dispatch<SetStateAction<boolean>>;
}

const UNASSIGNED = "__unassigned";

export function EditPaAssignedToDialog({
	clientId,
	value,
	setOpen,
}: EditPaAssignedToDialogProps) {
	const utils = api.useUtils();
	const { data: users } = api.users.getAll.useQuery({ archived: false });
	const [paAssignedTo, setPaAssignedTo] = useState(value);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Staff are picked by first name, since that's how PA Assigned To is
	// tracked on the Punchlist. Falls back to including the current value
	// even if it doesn't match a user, so an existing (e.g. legacy) value
	// isn't silently dropped from the list.
	const firstNames = useMemo(() => {
		const names = new Set<string>();
		for (const user of users ?? []) {
			const firstName = user.name?.split(" ")[0];
			if (firstName) names.add(firstName);
		}
		if (value) names.add(value);
		return [...names].sort((a, b) => a.localeCompare(b));
	}, [users, value]);

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
			<Select
				onValueChange={(v) => setPaAssignedTo(v === UNASSIGNED ? "" : v)}
				value={paAssignedTo || UNASSIGNED}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Who's assigned?" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
					{firstNames.map((firstName) => (
						<SelectItem key={firstName} value={firstName}>
							{firstName}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
