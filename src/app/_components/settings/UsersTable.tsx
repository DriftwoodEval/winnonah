"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
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
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import {
	type PermissionsObject,
	permissionPresets,
	permissions,
	permissionsSchema,
} from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import type { User } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

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
	const form = useForm<UsersTableFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			permissions: {},
		},
	});

	const watchedPermissions = form.watch("permissions");
	const { setValue } = form;

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
			form.setValue("permissions", selectedPreset.permissions, {
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
						<SelectTrigger className="w-full sm:w-fit">
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
				{Object.entries(permissions).map(([groupKey, group]) => (
					<div key={groupKey}>
						{/* Group Checkbox */}
						<div className="mb-3 flex items-center space-x-2">
							<Checkbox
								checked={getGroupState(group.permissions)}
								id={groupKey}
								onCheckedChange={(checked) => {
									const currentPermissions = {
										...form.getValues("permissions"),
									};
									group.permissions.forEach((p) => {
										currentPermissions[p.id] = !!checked;
									});
									form.setValue("permissions", currentPermissions, {
										shouldDirty: true,
										shouldValidate: true,
									});
								}}
							/>
							<FormLabel className="font-semibold text-lg" htmlFor={groupKey}>
								{group.title}
							</FormLabel>
						</div>

						{/* Individual Checkboxes */}
						<div className="ml-8 space-y-2">
							{group.permissions.map((p) => (
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
														id={p.id}
														onCheckedChange={field.onChange}
													/>
												</FormControl>
												<FormLabel htmlFor={p.id}>{p.title}</FormLabel>
											</div>
											<FormMessage />
										</FormItem>
									)}
								/>
							))}
						</div>
					</div>
				))}
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
				});
				log.error(error, "Failed to update user");
			},
		});

	const handleEditSubmit = (values: UsersTableFormValues) => {
		updateUser({
			userId: user.id,
			...values,
		});
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
				</DropdownMenuContent>
			</DropdownMenu>

			<ResponsiveDialog
				open={isEditDialogOpen}
				setOpen={setIsEditDialogOpen}
				title="Create Invite"
			>
				<UsersTableForm
					initialData={user}
					isLoading={isUpdating}
					onFinished={() => setIsEditDialogOpen(false)}
					onSubmit={handleEditSubmit}
				/>
			</ResponsiveDialog>
		</>
	);
}

export default function UsersTable() {
	const { data: session } = useSession();
	const canEdit = session
		? hasPermission(session.user.permissions, "settings:users:edit")
		: false;

	const { data: users, isLoading: isLoadingUsers } =
		api.users.getAll.useQuery();

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
						{isLoadingUsers ? (
							<TableRow>
								<TableCell className="text-center" colSpan={canEdit ? 5 : 4}>
									Loading...
								</TableCell>
							</TableRow>
						) : users && users.length > 0 ? (
							users.map((user) => (
								<TableRow key={user.id}>
									{canEdit && (
										<TableCell>
											<UsersTableActionsMenu user={user} />
										</TableCell>
									)}
									<TableCell>
										<Avatar>
											<AvatarImage src={user.image ?? ""} />
											<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
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
								<TableCell className="text-center" colSpan={canEdit ? 5 : 4}>
									No users found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Card Layout for Small Screens (mobile) */}
			<div className="grid grid-cols-1 gap-4 sm:hidden">
				{isLoadingUsers ? (
					<p className="text-center text-muted-foreground">Loading...</p>
				) : users && users.length > 0 ? (
					users.map((user) => (
						<div
							className="relative rounded-lg border bg-card p-4 text-card-foreground"
							key={user.id}
						>
							<div className="absolute top-2 right-2">
								{canEdit && <UsersTableActionsMenu user={user} />}
							</div>
							<div className="flex items-start justify-between">
								<div className="flex items-center gap-4">
									<Avatar>
										<AvatarImage src={user.image ?? ""} />
										<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
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
					<p className="text-center text-muted-foreground">No users found.</p>
				)}
			</div>
		</div>
	);
}
