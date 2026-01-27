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
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
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
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import { PERMISSIONS } from "~/lib/constants";
import { logger } from "~/lib/logger";
import type { User } from "~/lib/models";
import {
	type PermissionsObject,
	permissionPresets,
	permissionsSchema,
} from "~/lib/types";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

const log = logger.child({ module: "UsersTable" });

const formSchema = z.object({
	permissions: permissionsSchema,
});

type UsersTableFormValues = z.infer<typeof formSchema>;

interface UsersTableFormProps {
	initialData?: User;
	onSubmit: (values: UsersTableFormValues) => void;
	isLoading: boolean;
	onFinished: () => void;
	submitButtonText?: string;
}

function UsersTableForm({
	initialData,
	onSubmit,
	isLoading,
	onFinished,
}: UsersTableFormProps) {
	const { data: session } = useSession();
	const form = useForm<UsersTableFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			permissions: {},
		},
	});

	const watchedPermissions = form.watch("permissions");
	const { setValue } = form;

	const isPermissionDisabled = (permissionId: string) => {
		const isSelf = session?.user?.id === initialData?.id;
		const isEditUsersPermission = permissionId === "settings:users:edit";
		return isSelf && isEditUsersPermission;
	};

	useEffect(() => {
		if (initialData?.permissions) {
			setValue("permissions", initialData.permissions as PermissionsObject);
		}
	}, [initialData, setValue]);

	const getGroupState = (
		groupPermissions: readonly { id: string; title: string }[],
	) => {
		const allChecked = groupPermissions.every(
			(p) => watchedPermissions?.[p.id],
		);
		const anyChecked = groupPermissions.some((p) => watchedPermissions?.[p.id]);

		if (allChecked) return true;
		if (anyChecked) return "indeterminate";
		return false;
	};

	const handlePresetChange = (presetValue: string) => {
		const selectedPreset = permissionPresets.find(
			(p) => p.value === presetValue,
		);
		if (selectedPreset) {
			const newPermissions = { ...selectedPreset.permissions };

			if (isPermissionDisabled("settings:users:edit")) {
				newPermissions["settings:users:edit"] = true;
			}

			form.setValue("permissions", newPermissions, {
				shouldDirty: true,
				shouldValidate: true,
			});
		}
	};

	return (
		<Form {...form}>
			<form
				className="relative space-y-6"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<div className="relative w-full sm:absolute sm:flex sm:justify-end">
					<Select onValueChange={handlePresetChange}>
						<SelectTrigger className="w-full sm:w-fit" size="sm">
							<SelectValue placeholder="Select a preset..." />
						</SelectTrigger>
						<SelectContent>
							{permissionPresets.map((preset) => (
								<SelectItem key={preset.value} value={preset.value}>
									{preset.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-8">
					{Object.entries(PERMISSIONS).map(([categoryKey, category]) => (
						<div className="space-y-4" key={categoryKey}>
							<h4 className="border-b pb-2 font-bold text-lg">
								{category.title}
							</h4>
							<div className="ml-4 grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
								{Object.entries(category.subgroups).map(
									([subgroupKey, subgroup]) => (
										<div key={subgroupKey}>
											{/* Subgroup Checkbox */}
											<div className="mb-3 flex items-center space-x-2">
												<Checkbox
													checked={getGroupState(subgroup.permissions)}
													id={`${categoryKey}-${subgroupKey}`}
													onCheckedChange={() => {
														const currentState = getGroupState(
															subgroup.permissions,
														);

														// If false, become true, if checked OR indeterminate, become false
														const newCheckedState = currentState === false;

														const currentPermissions = {
															...form.getValues("permissions"),
														};
														subgroup.permissions.forEach(
															(p: { id: string }) => {
																if (!isPermissionDisabled(p.id)) {
																	currentPermissions[p.id] = newCheckedState;
																}
															},
														);
														form.setValue("permissions", currentPermissions, {
															shouldDirty: true,
															shouldValidate: true,
														});
													}}
												/>
												<FormLabel
													className="font-semibold text-md"
													htmlFor={`${categoryKey}-${subgroupKey}`}
												>
													{subgroup.title}
												</FormLabel>
											</div>

											{/* Individual Checkboxes */}
											<div className="ml-8 space-y-2">
												{subgroup.permissions.map(
													(p: { id: string; title: string }) => (
														<FormField
															control={form.control}
															key={p.id}
															name={`permissions.${p.id}`}
															render={({ field }) => (
																<FormItem>
																	<div className="flex items-center space-x-2">
																		<FormControl>
																			<Checkbox
																				checked={field.value}
																				disabled={isPermissionDisabled(p.id)}
																				id={p.id}
																				onCheckedChange={field.onChange}
																			/>
																		</FormControl>
																		<FormLabel htmlFor={p.id}>
																			{p.title}
																		</FormLabel>
																	</div>
																	<FormMessage />
																</FormItem>
															)}
														/>
													),
												)}
											</div>
										</div>
									),
								)}
							</div>
						</div>
					))}
				</div>
				{/* Submit and Cancel Buttons */}
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

function UsersTableActionsMenu({ user }: { user: User }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
	const utils = api.useUtils();

	const isDesktop = useMediaQuery("(min-width: 768px)");
	const alignValue = isDesktop ? "start" : "end";

	const { mutate: updateUser, isPending: isUpdating } =
		api.users.updateUser.useMutation({
			onSuccess: () => {
				utils.users.getAll.invalidate();
				setIsEditDialogOpen(false);
			},
			onError: (error) => {
				toast.error("Failed to update user", {
					description: String(error.message),
					duration: 10000,
				});
				log.error(error, "Failed to update user");
			},
		});

	const { mutate: updateUserArchiveStatus, isPending: isUpdatingStatus } =
		api.users.updateUserArchiveStatus.useMutation({
			onSuccess: () => {
				utils.users.getAll.invalidate();
				setIsArchiveDialogOpen(false);
				toast.success("User status updated");
			},
			onError: (error) => {
				toast.error("Failed to update user status", {
					description: String(error.message),
					duration: 10000,
				});
				log.error(error, "Failed to update user status");
			},
		});

	const handleEditSubmit = (values: UsersTableFormValues) => {
		updateUser({
			userId: user.id,
			...values,
		});
	};

	const handleArchiveToggle = () => {
		updateUserArchiveStatus({ userId: user.id, archived: !user.archived });
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
				<DropdownMenuContent align={alignValue}>
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className={user.archived ? "" : "text-destructive"}
						onClick={() => setIsArchiveDialogOpen(true)}
					>
						{user.archived ? "Unarchive" : "Archive"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ResponsiveDialog
				className="sm:max-w-3xl"
				description={user.name ?? ""}
				open={isEditDialogOpen}
				setOpen={setIsEditDialogOpen}
				title="Edit User"
			>
				<UsersTableForm
					initialData={user}
					isLoading={isUpdating}
					onFinished={() => setIsEditDialogOpen(false)}
					onSubmit={handleEditSubmit}
				/>
			</ResponsiveDialog>

			<AlertDialog
				onOpenChange={setIsArchiveDialogOpen}
				open={isArchiveDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							{user.archived
								? "Unarchiving a user will allow them to log in again."
								: "Archiving a user will prevent them from logging in. This action can be reversed."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={
								!user.archived ? "bg-destructive hover:bg-destructive/90" : ""
							}
							disabled={isUpdatingStatus}
							onClick={handleArchiveToggle}
						>
							{isUpdatingStatus
								? user.archived
									? "Unarchiving..."
									: "Archiving..."
								: user.archived
									? "Unarchive"
									: "Archive"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export default function UsersTable() {
	const can = useCheckPermission();
	const canEdit = can("settings:users:edit");

	const { data: activeUsers, isLoading: isLoadingActiveUsers } =
		api.users.getAll.useQuery({ archived: false });
	const { data: archivedUsers, isLoading: isLoadingArchivedUsers } =
		api.users.getAll.useQuery({ archived: true });

	const getInitials = (name: string | null | undefined) => {
		if (!name) return "";
		return name
			.split(" ")
			.map((n) => (n ?? "")[0]?.toUpperCase())
			.join("");
	};

	return (
		<div className="px-4">
			<h3 className="pb-4 font-bold text-lg">Users</h3>
			<Tabs defaultValue="active">
				<TabsList>
					<TabsTrigger value="active">Active Users</TabsTrigger>
					<TabsTrigger value="archived">Archived Users</TabsTrigger>
				</TabsList>
				<TabsContent value="active">
					{/* Table for Medium Screens and Up (sm:) */}
					<div className="hidden sm:block">
						<Table>
							<TableHeader>
								<TableRow>
									{canEdit && <TableHead className="w-[20px]"></TableHead>}
									<TableHead className="w-[20px]"></TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoadingActiveUsers ? (
									<TableRow>
										<TableCell
											className="text-center"
											colSpan={canEdit ? 5 : 4}
										>
											Loading...
										</TableCell>
									</TableRow>
								) : activeUsers && activeUsers.length > 0 ? (
									activeUsers.map((user) => (
										<TableRow key={user.id}>
											{canEdit && (
												<TableCell>
													<UsersTableActionsMenu user={user} />
												</TableCell>
											)}
											<TableCell>
												<Avatar>
													<AvatarImage src={user.image ?? ""} />
													<AvatarFallback>
														{getInitials(user.name)}
													</AvatarFallback>
												</Avatar>
											</TableCell>
											<TableCell className="font-medium">{user.name}</TableCell>
											<TableCell>
												<Link
													className="hover:underline"
													href={`mailto:${user.email}`}
												>
													{user.email}
												</Link>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											className="text-center"
											colSpan={canEdit ? 5 : 4}
										>
											No active users found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					{/* Card Layout for Small Screens (mobile) */}
					<div className="grid grid-cols-1 gap-4 sm:hidden">
						{isLoadingActiveUsers ? (
							<p className="text-center text-muted-foreground">Loading...</p>
						) : activeUsers && activeUsers.length > 0 ? (
							activeUsers.map((user) => (
								<div
									className="relative rounded-md border bg-card p-4 text-card-foreground"
									key={user.id}
								>
									<div className="absolute top-2 right-2">
										{canEdit && <UsersTableActionsMenu user={user} />}
									</div>
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-4">
											<Avatar>
												<AvatarImage src={user.image ?? ""} />
												<AvatarFallback>
													{getInitials(user.name)}
												</AvatarFallback>
											</Avatar>
											<div className="space-y-1">
												<p className="font-medium">{user.name}</p>
												<p className="text-muted-foreground text-sm">
													{user.email.length > 25
														? `${user.email.slice(0, 22)}...`
														: user.email}
												</p>
											</div>
										</div>
									</div>
								</div>
							))
						) : (
							<p className="text-center text-muted-foreground">
								No active users found.
							</p>
						)}
					</div>
				</TabsContent>
				<TabsContent value="archived">
					{/* Table for Medium Screens and Up (sm:) */}
					<div className="hidden sm:block">
						<Table>
							<TableHeader>
								<TableRow>
									{canEdit && <TableHead className="w-[20px]"></TableHead>}
									<TableHead className="w-[20px]"></TableHead>
									<TableHead>Name</TableHead>
									<TableHead>Email</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoadingArchivedUsers ? (
									<TableRow>
										<TableCell
											className="text-center"
											colSpan={canEdit ? 5 : 4}
										>
											Loading...
										</TableCell>
									</TableRow>
								) : archivedUsers && archivedUsers.length > 0 ? (
									archivedUsers.map((user) => (
										<TableRow key={user.id}>
											{canEdit && (
												<TableCell>
													<UsersTableActionsMenu user={user} />
												</TableCell>
											)}
											<TableCell>
												<Avatar>
													<AvatarImage src={user.image ?? ""} />
													<AvatarFallback>
														{getInitials(user.name)}
													</AvatarFallback>
												</Avatar>
											</TableCell>
											<TableCell className="font-medium">{user.name}</TableCell>
											<TableCell>
												<Link
													className="hover:underline"
													href={`mailto:${user.email}`}
												>
													{user.email}
												</Link>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											className="text-center"
											colSpan={canEdit ? 5 : 4}
										>
											No archived users found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					{/* Card Layout for Small Screens (mobile) */}
					<div className="grid grid-cols-1 gap-4 sm:hidden">
						{isLoadingArchivedUsers ? (
							<p className="text-center text-muted-foreground">Loading...</p>
						) : archivedUsers && archivedUsers.length > 0 ? (
							archivedUsers.map((user) => (
								<div
									className="relative rounded-md border bg-card p-4 text-card-foreground"
									key={user.id}
								>
									<div className="absolute top-2 right-2">
										{canEdit && <UsersTableActionsMenu user={user} />}
									</div>
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-4">
											<Avatar>
												<AvatarImage src={user.image ?? ""} />
												<AvatarFallback>
													{getInitials(user.name)}
												</AvatarFallback>
											</Avatar>
											<div className="space-y-1">
												<p className="font-medium">{user.name}</p>
												<p className="text-muted-foreground text-sm">
													{user.email.length > 25
														? `${user.email.slice(0, 22)}...`
														: user.email}
												</p>
											</div>
										</div>
									</div>
								</div>
							))
						) : (
							<p className="text-center text-muted-foreground">
								No archived users found.
							</p>
						)}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
