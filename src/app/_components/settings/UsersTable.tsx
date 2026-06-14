"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
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
import { Input } from "@ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { Loader2, MoreHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

const normalizePhone = (val: string): string => {
	if (!val || val.trim() === "") return "";
	const stripped = val.replace(/[\s\-().]/g, "");
	return stripped.startsWith("+") ? stripped : `+1${stripped}`;
};

const formatPhoneAsYouType = (value: string): string => {
	let digits = value.replace(/\D/g, "");
	if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
	digits = digits.slice(0, 10);
	if (digits.length === 0) return "";
	if (digits.length <= 3) return `(${digits}`;
	if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const getInitials = (name: string | null | undefined) => {
	if (!name) return "";
	return name
		.split(" ")
		.map((n) => (n ?? "")[0]?.toUpperCase())
		.join("");
};

const formSchema = z.object({
	permissions: permissionsSchema,
	phoneNumber: z
		.string()
		.refine((val) => {
			if (!val) return true;
			const digits = val.replace(/\D/g, "");
			const stripped =
				digits.length === 11 && digits.startsWith("1")
					? digits.slice(1)
					: digits;
			return stripped.length === 10;
		}, "Must be a valid 10-digit phone number")
		.or(z.literal(""))
		.nullable()
		.optional(),
});

type UsersTableFormValues = z.infer<typeof formSchema>;

interface UsersTableFormProps {
	initialData?: User;
	onSubmit: (values: UsersTableFormValues) => void;
	isLoading: boolean;
	onFinished: () => void;
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
			phoneNumber: "",
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
		setValue(
			"phoneNumber",
			initialData?.phoneNumber
				? formatPhoneAsYouType(initialData.phoneNumber)
				: "",
		);
	}, [initialData, setValue]);

	const getGroupState = (
		groupPermissions: readonly { id: string; title: string; parent?: string }[],
	) => {
		const topLevel = groupPermissions.filter((p) => !p.parent);
		const allChecked = topLevel.every((p) => watchedPermissions?.[p.id]);
		const anyChecked = topLevel.some((p) => watchedPermissions?.[p.id]);
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
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				{/* Permissions */}
				<div className="space-y-3">
					<div className="flex items-center justify-between border-b pb-2">
						<h4 className="font-bold text-lg">Permissions</h4>
						<Select onValueChange={handlePresetChange}>
							<SelectTrigger className="w-auto" size="sm">
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
					<Accordion className="rounded-md border" type="multiple">
						{Object.entries(PERMISSIONS).map(([categoryKey, category]) => (
							<AccordionItem key={categoryKey} value={categoryKey}>
								<AccordionTrigger className="px-4 font-semibold text-base hover:no-underline">
									{category.title}
								</AccordionTrigger>
								<AccordionContent className="px-4 pt-2 pb-4">
									<div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
										{Object.entries(category.subgroups).map(
											([subgroupKey, subgroup]) => (
												<div key={subgroupKey}>
													<div className="mb-3 flex items-center space-x-2">
														<Checkbox
															checked={getGroupState(subgroup.permissions)}
															id={`${categoryKey}-${subgroupKey}`}
															onCheckedChange={() => {
																const currentState = getGroupState(
																	subgroup.permissions,
																);
																const newCheckedState = currentState === false;
																const currentPermissions = {
																	...form.getValues("permissions"),
																};
																subgroup.permissions.forEach(
																	(p: { id: string }) => {
																		if (!isPermissionDisabled(p.id)) {
																			currentPermissions[p.id] =
																				newCheckedState;
																		}
																	},
																);
																form.setValue(
																	"permissions",
																	currentPermissions,
																	{ shouldDirty: true, shouldValidate: true },
																);
															}}
														/>
														<FormLabel
															className="font-semibold text-md"
															htmlFor={`${categoryKey}-${subgroupKey}`}
														>
															{subgroup.title}
														</FormLabel>
													</div>
													<div className="ml-8 space-y-2">
														{subgroup.permissions
															.filter(
																(p: {
																	id: string;
																	title: string;
																	parent?: string;
																}) => !p.parent,
															)
															.map(
																(p: {
																	id: string;
																	title: string;
																	parent?: string;
																}) => {
																	const subPermissions =
																		subgroup.permissions.filter(
																			(s: {
																				id: string;
																				title: string;
																				parent?: string;
																			}) => s.parent === p.id,
																		);
																	return (
																		<div key={p.id}>
																			<FormField
																				control={form.control}
																				name={`permissions.${p.id}`}
																				render={({ field }) => (
																					<FormItem>
																						<div className="flex items-center space-x-2">
																							<FormControl>
																								{isPermissionDisabled(p.id) ? (
																									<TooltipProvider>
																										<Tooltip>
																											<TooltipTrigger asChild>
																												<span className="cursor-not-allowed">
																													<Checkbox
																														checked={
																															field.value
																														}
																														disabled
																														id={p.id}
																													/>
																												</span>
																											</TooltipTrigger>
																											<TooltipContent>
																												You can't remove your
																												own user-management
																												permission
																											</TooltipContent>
																										</Tooltip>
																									</TooltipProvider>
																								) : (
																									<Checkbox
																										checked={field.value}
																										id={p.id}
																										onCheckedChange={(
																											checked,
																										) => {
																											field.onChange(checked);
																											if (!checked) {
																												for (const sub of subPermissions) {
																													form.setValue(
																														`permissions.${sub.id}`,
																														false,
																													);
																												}
																											}
																										}}
																									/>
																								)}
																							</FormControl>
																							<FormLabel htmlFor={p.id}>
																								{p.title}
																							</FormLabel>
																						</div>
																						<FormMessage />
																					</FormItem>
																				)}
																			/>
																			{subPermissions.length > 0 && (
																				<div className="mt-1 ml-6 space-y-1">
																					{subPermissions.map(
																						(sub: {
																							id: string;
																							title: string;
																							parent?: string;
																						}) => (
																							<FormField
																								control={form.control}
																								key={sub.id}
																								name={`permissions.${sub.id}`}
																								render={({ field }) => (
																									<FormItem>
																										<div className="flex items-center space-x-2">
																											<FormControl>
																												<Checkbox
																													checked={field.value}
																													disabled={
																														!watchedPermissions?.[
																															p.id
																														]
																													}
																													id={sub.id}
																													onCheckedChange={
																														field.onChange
																													}
																												/>
																											</FormControl>
																											<FormLabel
																												className="font-normal"
																												htmlFor={sub.id}
																											>
																												{sub.title}
																											</FormLabel>
																										</div>
																									</FormItem>
																								)}
																							/>
																						),
																					)}
																				</div>
																			)}
																		</div>
																	);
																},
															)}
													</div>
												</div>
											),
										)}
									</div>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>

				{/* Phone number */}
				<div className="border-t pt-4">
					<FormField
						control={form.control}
						name="phoneNumber"
						render={({ field }) => (
							<FormItem className="max-w-xs">
								<FormLabel>Phone Number</FormLabel>
								<FormControl>
									<Input
										placeholder="(212) 555-1234"
										{...field}
										onBlur={field.onBlur}
										onChange={(e) => {
											field.onChange(formatPhoneAsYouType(e.target.value));
										}}
										value={field.value ?? ""}
									/>
								</FormControl>
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
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : (
							"Save changes"
						)}
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

	const { mutateAsync: updateUser, isPending: isUpdating } =
		api.users.updateUser.useMutation({
			onError: (error) => {
				toast.error("Failed to update user", {
					description: String(error.message),
					duration: 10000,
				});
				log.error(error, "Failed to update user");
			},
		});

	const { mutateAsync: setPhone } = api.users.setPhone.useMutation({
		onError: (error) => {
			toast.error("Failed to update phone", {
				description: String(error.message),
				duration: 10000,
			});
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

	const handleEditSubmit = async (values: UsersTableFormValues) => {
		const normalized = values.phoneNumber
			? normalizePhone(values.phoneNumber)
			: "";
		const phoneValue = normalized === "" ? null : normalized;
		await Promise.all([
			updateUser({ userId: user.id, permissions: values.permissions }),
			setPhone({ userId: user.id, phoneNumber: phoneValue }),
		]);
		utils.users.getAll.invalidate();
		setIsEditDialogOpen(false);
		toast.success("User updated");
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

interface UsersTabContentProps {
	users: User[] | undefined;
	isLoading: boolean;
	canEdit: boolean;
	emptyMessage: string;
}

function UsersTabContent({
	users,
	isLoading,
	canEdit,
	emptyMessage,
}: UsersTabContentProps) {
	const colSpan = canEdit ? 5 : 4;

	return (
		<>
			{/* Table for Medium Screens and Up */}
			<div className="hidden sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							{canEdit && <TableHead className="w-[20px]" />}
							<TableHead className="w-[20px]" />
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Phone</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 3 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
								<TableRow key={i}>
									{canEdit && (
										<TableCell>
											<Skeleton className="h-8 w-8" />
										</TableCell>
									)}
									<TableCell>
										<Skeleton className="h-8 w-8 rounded-full" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-32" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-48" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-28" />
									</TableCell>
								</TableRow>
							))
						) : users && users.length > 0 ? (
							users.map((user) => (
								<TableRow className="group" key={user.id}>
									{canEdit && (
										<TableCell className="opacity-0 transition-opacity group-hover:opacity-100 has-data-[state=open]:opacity-100">
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
									<TableCell className="text-muted-foreground">
										{user.phoneNumber
											? formatPhoneAsYouType(user.phoneNumber)
											: "—"}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell className="py-12 text-center" colSpan={colSpan}>
									<div className="flex flex-col items-center gap-2 text-muted-foreground">
										<Users className="h-8 w-8" />
										<p className="text-sm">{emptyMessage}</p>
									</div>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Card Layout for Small Screens */}
			<div className="grid grid-cols-1 gap-4 sm:hidden">
				{isLoading ? (
					Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
						<div className="rounded-md border bg-card p-4" key={i}>
							<div className="flex items-center gap-4">
								<Skeleton className="h-10 w-10 rounded-full" />
								<div className="space-y-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
							</div>
						</div>
					))
				) : users && users.length > 0 ? (
					users.map((user) => (
						<div
							className="relative rounded-md border bg-card p-4 text-card-foreground"
							key={user.id}
						>
							{canEdit && (
								<div className="absolute top-2 right-2">
									<UsersTableActionsMenu user={user} />
								</div>
							)}
							<div className="flex items-center gap-4">
								<Avatar>
									<AvatarImage src={user.image ?? ""} />
									<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 space-y-1">
									<p className="font-medium">{user.name}</p>
									<p className="truncate text-muted-foreground text-sm">
										{user.email}
									</p>
									{user.phoneNumber && (
										<p className="text-muted-foreground text-sm">
											{formatPhoneAsYouType(user.phoneNumber)}
										</p>
									)}
								</div>
							</div>
						</div>
					))
				) : (
					<div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
						<Users className="h-8 w-8" />
						<p className="text-sm">{emptyMessage}</p>
					</div>
				)}
			</div>
		</>
	);
}

export default function UsersTable() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const activeTab = searchParams.get("usersTab") ?? "active";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("usersTab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const can = useCheckPermission();
	const canEdit = can("settings:users:edit");

	const { data: activeUsers, isLoading: isLoadingActiveUsers } =
		api.users.getAll.useQuery({ archived: false });
	const { data: archivedUsers, isLoading: isLoadingArchivedUsers } =
		api.users.getAll.useQuery({ archived: true });

	return (
		<div className="px-4">
			<h3 className="pb-4 font-bold text-lg">Users</h3>
			<Tabs onValueChange={handleTabChange} value={activeTab}>
				<TabsList>
					<TabsTrigger value="active">
						Active Users
						{activeUsers !== undefined && (
							<span className="ml-1.5 text-muted-foreground">
								({activeUsers.length})
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value="archived">
						Archived Users
						{archivedUsers !== undefined && (
							<span className="ml-1.5 text-muted-foreground">
								({archivedUsers.length})
							</span>
						)}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="active">
					<UsersTabContent
						canEdit={canEdit}
						emptyMessage="No active users found."
						isLoading={isLoadingActiveUsers}
						users={activeUsers}
					/>
				</TabsContent>
				<TabsContent value="archived">
					<UsersTabContent
						canEdit={canEdit}
						emptyMessage="No archived users found."
						isLoading={isLoadingArchivedUsers}
						users={archivedUsers}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
