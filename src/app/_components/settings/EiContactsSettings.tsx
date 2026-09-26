"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { formatPhoneNumber } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type EiContact = RouterOutputs["eiContacts"]["list"][number];

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	phoneNumber: z.string().min(1, "Phone number is required"),
});

function EiContactDialog({
	isOpen,
	onClose,
	initialData,
}: {
	isOpen: boolean;
	onClose: () => void;
	initialData?: EiContact;
}) {
	const utils = api.useUtils();
	const isEditing = !!initialData;

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: { name: "", phoneNumber: "" },
	});

	useEffect(() => {
		if (isOpen) {
			form.reset({
				name: initialData?.name ?? "",
				phoneNumber: initialData
					? formatPhoneNumber(initialData.phoneNumber)
					: "",
			});
		}
	}, [isOpen, initialData, form]);

	const upsert = api.eiContacts.upsert.useMutation({
		onSuccess: () => {
			toast.success(isEditing ? "Contact updated" : "Contact created");
			void utils.eiContacts.list.invalidate();
			onClose();
		},
		onError: (error) => toast.error(`Error: ${error.message}`),
	});

	return (
		<Dialog onOpenChange={onClose} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEditing ? "Edit EI Contact" : "Add EI Contact"}
					</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form
						className="space-y-4"
						onSubmit={form.handleSubmit((values) =>
							upsert.mutate({ id: initialData?.id, ...values }),
						)}
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g., Jane Smith" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="phoneNumber"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Phone Number</FormLabel>
									<FormControl>
										<Input placeholder="(555) 555-5555" type="tel" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Button onClick={onClose} type="button" variant="ghost">
								Cancel
							</Button>
							<Button disabled={upsert.isPending} type="submit">
								{upsert.isPending ? "Saving..." : "Save"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

export default function EiContactsSettings() {
	const utils = api.useUtils();
	const { data: contacts } = api.eiContacts.list.useQuery();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editing, setEditing] = useState<EiContact | null>(null);
	const [deleting, setDeleting] = useState<EiContact | null>(null);

	const deleteContact = api.eiContacts.delete.useMutation({
		onSuccess: () => {
			toast.success("Contact deleted");
			void utils.eiContacts.list.invalidate();
			setDeleting(null);
		},
		onError: (error) => toast.error(`Error: ${error.message}`),
	});

	return (
		<div className="space-y-4 px-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="font-bold text-lg">EI Contacts</h3>
					<p className="text-muted-foreground text-sm">
						Early Intervention coordinators, shared across clients. Selected
						from a client's Edit dialog as their EI Contact.
					</p>
				</div>
				<Button
					onClick={() => {
						setEditing(null);
						setIsDialogOpen(true);
					}}
				>
					Add Contact
				</Button>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Phone Number</TableHead>
						<TableHead className="w-24" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{!contacts?.length ? (
						<TableRow>
							<TableCell
								className="text-center text-muted-foreground"
								colSpan={3}
							>
								No EI contacts yet.
							</TableCell>
						</TableRow>
					) : (
						contacts.map((contact) => (
							<TableRow key={contact.id}>
								<TableCell>{contact.name}</TableCell>
								<TableCell>{formatPhoneNumber(contact.phoneNumber)}</TableCell>
								<TableCell className="flex gap-1">
									<Button
										onClick={() => {
											setEditing(contact);
											setIsDialogOpen(true);
										}}
										size="icon"
										variant="ghost"
									>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button
										onClick={() => setDeleting(contact)}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			<EiContactDialog
				initialData={editing ?? undefined}
				isOpen={isDialogOpen}
				onClose={() => {
					setIsDialogOpen(false);
					setEditing(null);
				}}
			/>

			<AlertDialog
				onOpenChange={(o) => !o && setDeleting(null)}
				open={!!deleting}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete EI Contact?</AlertDialogTitle>
						<AlertDialogDescription>
							Any client with "{deleting?.name}" selected as their EI Contact
							will have it cleared. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								deleting && deleteContact.mutate({ id: deleting.id })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
