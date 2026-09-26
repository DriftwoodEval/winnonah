"use client";

import { Button } from "@ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn, formatPhoneNumber } from "~/lib/utils";
import { api } from "~/trpc/react";

interface EiContactComboboxProps {
	value: number | null | undefined;
	onChange: (contactId: number | null) => void;
	disabled?: boolean;
}

export function EiContactCombobox({
	value,
	onChange,
	disabled,
}: EiContactComboboxProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState("");
	const [newPhone, setNewPhone] = useState("");

	const { data: contacts } = api.eiContacts.list.useQuery(undefined, {
		enabled: open,
	});
	const selected = contacts?.find((c) => c.id === value);

	const createContact = api.eiContacts.upsert.useMutation({
		onSuccess: (result) => {
			void utils.eiContacts.list.invalidate();
			onChange(result.id);
			setCreating(false);
			setNewName("");
			setNewPhone("");
			setOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to create EI contact", {
				description: error.message,
			});
		},
	});

	return (
		<Popover
			modal
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setCreating(false);
			}}
			open={open}
		>
			<PopoverTrigger asChild disabled={disabled}>
				<Button
					className={cn(
						"w-full justify-between",
						!selected && "text-muted-foreground",
					)}
					role="combobox"
					type="button"
					variant="outline"
				>
					{selected
						? `${selected.name} — ${formatPhoneNumber(selected.phoneNumber)}`
						: "Select EI contact"}
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
				{creating ? (
					<div className="space-y-3 p-3">
						<div className="space-y-1.5">
							<Label>Name</Label>
							<Input
								autoFocus
								onChange={(e) => setNewName(e.target.value)}
								placeholder="e.g., Jane Smith"
								value={newName}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Phone Number</Label>
							<Input
								onChange={(e) => setNewPhone(e.target.value)}
								placeholder="(555) 555-5555"
								type="tel"
								value={newPhone}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								onClick={() => setCreating(false)}
								size="sm"
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button
								disabled={
									!newName.trim() || !newPhone.trim() || createContact.isPending
								}
								onClick={() =>
									createContact.mutate({
										name: newName.trim(),
										phoneNumber: newPhone,
									})
								}
								size="sm"
								type="button"
							>
								{createContact.isPending ? "Saving..." : "Save"}
							</Button>
						</div>
					</div>
				) : (
					<Command>
						<CommandInput
							className="h-9"
							onValueChange={setSearch}
							placeholder="Search name or phone..."
							value={search}
						/>
						<CommandList>
							<CommandEmpty>No contacts found.</CommandEmpty>
							<CommandGroup>
								{contacts?.map((contact) => (
									<CommandItem
										key={contact.id}
										onSelect={() => {
											onChange(contact.id);
											setOpen(false);
										}}
										value={`${contact.name} ${contact.phoneNumber}`}
									>
										{contact.name} &mdash;{" "}
										{formatPhoneNumber(contact.phoneNumber)}
										<Check
											className={cn(
												"ml-auto",
												contact.id === value ? "opacity-100" : "opacity-0",
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
						<div className="border-t p-1">
							<Button
								className="w-full justify-start"
								onClick={() => {
									setNewName(search);
									setCreating(true);
								}}
								size="sm"
								type="button"
								variant="ghost"
							>
								<Plus className="h-4 w-4" />
								Add new EI contact
							</Button>
						</div>
					</Command>
				)}
			</PopoverContent>
		</Popover>
	);
}
