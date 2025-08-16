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
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import { userRoles } from "~/lib/types";
import { checkRole } from "~/lib/utils";
import type { Invitation } from "~/server/lib/types";
import { api } from "~/trpc/react";

const log = logger.child({ module: "InvitesTable" });

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
			log.error(error, "Failed to create invite");
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

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const alignValue = isDesktop ? "start" : "end";

	const deleteInvite = api.users.deleteInvitation.useMutation({
		onSuccess: () => {
			utils.users.getPendingInvitations.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to delete invite", {
				description: String(error.message),
			});
			log.error(error, "Failed to delete invite");
		},
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="h-8 w-8 p-0" variant="ghost">
					<span className="sr-only">Open menu</span>
					<MoreHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={alignValue}>
				<DropdownMenuItem
					className="text-destructive"
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
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Pending Invites</h3>
				{admin && <AddInviteButton />}
			</div>

			{/* Table for Medium Screens and Up (sm:) */}
			<div className="hidden sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							{admin && <TableHead className="w-[50px]"></TableHead>}
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoadingInvites ? (
							<TableRow>
								<TableCell className="text-center" colSpan={admin ? 3 : 2}>
									Loading invites...
								</TableCell>
							</TableRow>
						) : invites && invites.length > 0 ? (
							invites.map((invite) => (
								<TableRow key={invite.id}>
									{admin && (
										<TableCell>
											<InvitesTableActionsMenu invite={invite} />
										</TableCell>
									)}
									<TableCell>
										<Link
											className="font-medium hover:underline"
											href={`mailto:${invite.email}`}
										>
											{invite.email}
										</Link>
									</TableCell>
									<TableCell className="capitalize">{invite.role}</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell className="text-center" colSpan={admin ? 3 : 2}>
									No pending invites found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Card Layout for Small Screens (mobile) */}
			<div className="space-y-4 sm:hidden">
				{isLoadingInvites ? (
					<p className="text-center text-muted-foreground">
						Loading invites...
					</p>
				) : invites && invites.length > 0 ? (
					invites.map((invite) => (
						<div
							className="flex items-center justify-between rounded-lg border bg-card p-4 text-card-foreground"
							key={invite.id}
						>
							<div>
								<p className="font-medium text-sm">{invite.email}</p>
								<p className="text-muted-foreground text-sm capitalize">
									{invite.role}
								</p>
							</div>
							{admin && <InvitesTableActionsMenu invite={invite} />}
						</div>
					))
				) : (
					<p className="text-center text-muted-foreground">
						No pending invites found.
					</p>
				)}
			</div>
		</div>
	);
}
