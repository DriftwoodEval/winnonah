"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import type { Invitation } from "~/lib/models";
import { permissionsSchema } from "~/lib/types";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
import { PermissionsField } from "./PermissionsField";

const log = logger.child({ module: "InvitesTable" });

const formSchema = z.object({
	email: z.email(),
	permissions: permissionsSchema,
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
			permissions: {},
		},
	});

	const permissions = form.watch("permissions");

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input
									autoComplete="off"
									disabled={isLoading}
									type="email"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<PermissionsField
					onChange={(p) =>
						form.setValue("permissions", p, {
							shouldDirty: true,
							shouldValidate: true,
						})
					}
					value={permissions ?? {}}
				/>

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
	const dialog = useResponsiveDialog();
	const utils = api.useUtils();

	const addInvitation = api.users.createInvitation.useMutation({
		onSuccess: () => {
			utils.users.getPendingInvitations.invalidate();
			dialog.closeDialog();
		},
		onError: (error) => {
			log.error(error, "Failed to create invite");
			toast.error("Failed to create invite", {
				description: String(error.message),
				duration: 10000,
			});
		},
	});

	const trigger = (
		<Button size="sm">
			<span className="hidden sm:block">Create Invite</span>
			<span className="sm:hidden">Create</span>
		</Button>
	);

	function onSubmit(values: InvitesTableFormValues) {
		addInvitation.mutate({
			...values,
		});
	}

	return (
		<ResponsiveDialog
			className="sm:max-w-3xl"
			open={dialog.open}
			setOpen={dialog.setOpen}
			title="Create Invite"
			trigger={trigger}
		>
			<InvitesTableForm
				isLoading={addInvitation.isPending}
				onFinished={dialog.closeDialog}
				onSubmit={onSubmit}
			/>
		</ResponsiveDialog>
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
				duration: 10000,
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
	const can = useCheckPermission();
	const canInvite = can("settings:users:invite");

	const { data: invites, isLoading: isLoadingInvites } =
		api.users.getPendingInvitations.useQuery();

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Pending Invites</h3>
				{canInvite && <AddInviteButton />}
			</div>

			{/* Table for Medium Screens and Up (sm:) */}
			<div className="hidden sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							{canInvite && <TableHead className="w-[50px]"></TableHead>}
							<TableHead>Email</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoadingInvites ? (
							<TableRow>
								<TableCell className="text-center" colSpan={canInvite ? 3 : 2}>
									Loading invites...
								</TableCell>
							</TableRow>
						) : invites && invites.length > 0 ? (
							invites.map((invite) => (
								<TableRow key={invite.id}>
									{canInvite && (
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
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell className="text-center" colSpan={canInvite ? 3 : 2}>
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
							className="flex items-center justify-between rounded-md border bg-card p-4 text-card-foreground"
							key={invite.id}
						>
							<div>
								<p className="font-medium text-sm">{invite.email}</p>
							</div>
							{canInvite && <InvitesTableActionsMenu invite={invite} />}
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
