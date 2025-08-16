"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { userRoles } from "~/lib/types";
import { checkRole } from "~/lib/utils";
import type { Invitation } from "~/server/lib/types";
import { api } from "~/trpc/react";

const formSchema = z.object({
	email: z.email(),
	role: z.enum(userRoles),
});

type InvitesTableFormValues = z.infer<typeof formSchema>;

interface InvitesTableFormProps {
	onSubmit: (values: InvitesTableFormValues) => void;
	isLoading: boolean;
	onFinished: () => void;
}

function InvitesTableForm({
	onSubmit,
	isLoading,
	onFinished,
}: InvitesTableFormProps) {
	const form = useForm<InvitesTableFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			role: "user",
		},
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="flex flex-wrap gap-6">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Email</FormLabel>
								<Input
									disabled={isLoading}
									{...field}
									autoComplete="off"
									type="email"
								/>

								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="role"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Role</FormLabel>
								<Select
									defaultValue={field.value}
									onValueChange={field.onChange}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Object.entries(userRoles).map(([key, value]) => (
											<SelectItem key={key} value={value}>
												{value.charAt(0).toUpperCase() + value.slice(1)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex justify-end gap-2">
					<Button onClick={onFinished} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading ? "Saving..." : "Submit"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function AddInviteButton() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const utils = api.useUtils();

	const addInvitation = api.users.createInvitation.useMutation({
		onSuccess: () => {
			utils.users.getPendingInvitations.invalidate();

			setIsDialogOpen(false);
		},
		onError: (error) => {
			console.error("Failed to create invite:", error);
			toast.error("Failed to create invite", {
				description: String(error.message),
			});
		},
	});

	function onSubmit(values: InvitesTableFormValues) {
		addInvitation.mutate({
			email: values.email,
			role: values.role,
		});
	}

	return (
		<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<span className="hidden sm:block">Create Invite</span>
					<span className="sm:hidden">Create</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create New Invite</DialogTitle>
				</DialogHeader>
				<InvitesTableForm
					isLoading={addInvitation.isPending}
					onFinished={() => setIsDialogOpen(false)}
					onSubmit={onSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
}

function InvitesTableActionsMenu({ invite }: { invite: Invitation }) {
	const utils = api.useUtils();

	const deleteInvite = api.users.deleteInvitation.useMutation({
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
				<DropdownMenuItem
					onClick={() => deleteInvite.mutate({ id: invite.id })}
				>
					Delete
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default function InvitesTable() {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const { data: invites, isLoading: isLoadingInvites } =
		api.users.getPendingInvitations.useQuery();

	return (
		<div className="mt-4 px-4 pb-4">
			<div className="flex items-center justify-between">
				<h4 className="font-bold leading-none">Invites</h4>
				{admin && <AddInviteButton />}
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						{admin && <TableHead className="w-[20px]"></TableHead>}
						<TableHead className="w-[100px]">Email</TableHead>
						<TableHead className="w-[100px]">Role</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoadingInvites && (
						<TableRow>
							<TableCell className="text-center" colSpan={6}>
								Loading...
							</TableCell>
						</TableRow>
					)}
					{invites?.map((invite) => (
						<TableRow key={invite.id}>
							{admin && (
								<TableCell>
									<InvitesTableActionsMenu invite={invite} />
								</TableCell>
							)}
							<TableCell>
								<Link
									className="hover:underline"
									href={`mailto:${invite.email}`}
								>
									{invite.email}
								</Link>
							</TableCell>
							<TableCell>
								{invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
