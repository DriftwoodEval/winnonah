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
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import type { Role } from "~/lib/models";
import { permissionsSchema } from "~/lib/types";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";
import { PermissionsField } from "./PermissionsField";

const log = logger.child({ module: "RolesTable" });

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	permissions: permissionsSchema,
	isDefault: z.boolean().optional(),
});

type RoleFormValues = z.infer<typeof formSchema>;

function RoleForm({
	role,
	onSubmit,
	isLoading,
	onFinished,
}: {
	role?: Role;
	onSubmit: (values: RoleFormValues) => void;
	isLoading: boolean;
	onFinished: () => void;
}) {
	const form = useForm<RoleFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: role?.name ?? "",
			permissions: (role?.permissions as RoleFormValues["permissions"]) ?? {},
			isDefault: role?.isDefault ?? false,
		},
	});

	const permissions = form.watch("permissions");

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<Input autoComplete="off" disabled={isLoading} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="isDefault"
					render={({ field }) => (
						<FormItem className="flex flex-row items-center gap-2 space-y-0">
							<FormControl>
								<Checkbox
									checked={field.value}
									disabled={isLoading}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="font-normal">
								Make this the default role for new users
							</FormLabel>
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
						{isLoading ? "Saving..." : "Save"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function AddRoleButton() {
	const dialog = useResponsiveDialog();
	const utils = api.useUtils();

	const createRole = api.roles.create.useMutation({
		onSuccess: () => {
			toast.success("Role created");
			utils.roles.getAll.invalidate();
			dialog.closeDialog();
		},
		onError: (error) => {
			log.error(error, "Failed to create role");
			toast.error("Failed to create role", {
				description: String(error.message),
				duration: 10000,
			});
		},
	});

	return (
		<ResponsiveDialog
			className="sm:max-w-4xl"
			open={dialog.open}
			setOpen={dialog.setOpen}
			title="Add Role"
			trigger={
				<Button size="sm">
					<span className="hidden sm:block">Add Role</span>
					<span className="sm:hidden">Add</span>
				</Button>
			}
		>
			<RoleForm
				isLoading={createRole.isPending}
				onFinished={dialog.closeDialog}
				onSubmit={(values) => createRole.mutate(values)}
			/>
		</ResponsiveDialog>
	);
}

function EditRoleDialog({
	role,
	open,
	setOpen,
}: {
	role: Role;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const utils = api.useUtils();

	const updateRole = api.roles.update.useMutation({
		onSuccess: () => {
			toast.success("Role updated");
			utils.roles.getAll.invalidate();
			setOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to update role");
			toast.error("Failed to update role", {
				description: String(error.message),
				duration: 10000,
			});
		},
	});

	return (
		<ResponsiveDialog
			className="sm:max-w-4xl"
			open={open}
			setOpen={setOpen}
			title="Edit Role"
		>
			<RoleForm
				isLoading={updateRole.isPending}
				onFinished={() => setOpen(false)}
				onSubmit={(values) => updateRole.mutate({ id: role.id, ...values })}
				role={role}
			/>
		</ResponsiveDialog>
	);
}

function RoleActionsMenu({ role }: { role: Role }) {
	const utils = api.useUtils();
	const [editOpen, setEditOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const alignValue = isDesktop ? "start" : "end";

	const deleteRole = api.roles.delete.useMutation({
		onSuccess: () => {
			toast.success("Role deleted");
			utils.roles.getAll.invalidate();
			setDeleteOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to delete role", {
				description: String(error.message),
				duration: 10000,
			});
			log.error(error, "Failed to delete role");
		},
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<span className="sr-only">Open menu</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={alignValue}>
					<DropdownMenuItem onClick={() => setEditOpen(true)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setDeleteOpen(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<EditRoleDialog open={editOpen} role={role} setOpen={setEditOpen} />

			<AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this role?</AlertDialogTitle>
						<AlertDialogDescription>
							This can't be undone. Anyone still assigned to "{role.name}" must
							be reassigned first.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive hover:bg-destructive/90"
							disabled={deleteRole.isPending}
							onClick={() => deleteRole.mutate({ id: role.id })}
						>
							{deleteRole.isPending ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export default function RolesTable() {
	const can = useCheckPermission();
	const canEditRoles = can("settings:roles:edit");

	const { data: roles, isLoading } = api.roles.getAll.useQuery();

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Roles</h3>
				{canEditRoles && <AddRoleButton />}
			</div>

			<div className="hidden sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							{canEditRoles && <TableHead className="w-[50px]"></TableHead>}
							<TableHead>Name</TableHead>
							<TableHead>Default</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell
									className="text-center"
									colSpan={canEditRoles ? 3 : 2}
								>
									Loading roles...
								</TableCell>
							</TableRow>
						) : roles && roles.length > 0 ? (
							roles.map((role) => (
								<TableRow key={role.id}>
									{canEditRoles && (
										<TableCell>
											<RoleActionsMenu role={role} />
										</TableCell>
									)}
									<TableCell className="font-medium">{role.name}</TableCell>
									<TableCell>
										{role.isDefault && <Badge variant="outline">Default</Badge>}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									className="text-center"
									colSpan={canEditRoles ? 3 : 2}
								>
									No roles found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className="space-y-4 sm:hidden">
				{isLoading ? (
					<p className="text-center text-muted-foreground">Loading roles...</p>
				) : roles && roles.length > 0 ? (
					roles.map((role) => (
						<div
							className="flex items-center justify-between rounded-md border bg-card p-4 text-card-foreground"
							key={role.id}
						>
							<div className="flex items-center gap-2">
								<p className="font-medium text-sm">{role.name}</p>
								{role.isDefault && <Badge variant="outline">Default</Badge>}
							</div>
							{canEditRoles && <RoleActionsMenu role={role} />}
						</div>
					))
				) : (
					<p className="text-center text-muted-foreground">No roles found.</p>
				)}
			</div>
		</div>
	);
}
