"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { userRoles } from "~/lib/types";
import { checkRole } from "~/lib/utils";
import type { User } from "~/server/lib/types";
import { api } from "~/trpc/react";

const formSchema = z.object({
	role: z.enum(userRoles),
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
			role: initialData?.role ?? undefined,
		},
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="flex flex-wrap justify-between">
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

function UsersTableActionsMenu({ user }: { user: User }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

	const { mutate: updateUser, isPending: isUpdating } =
		api.users.updateUser.useMutation({
			onSuccess: () => {
				setIsEditDialogOpen(false);
			},
			onError: (error) => console.error("Failed to update:", error),
		});

	const handleEditSubmit = (values: UsersTableFormValues) => {
		updateUser({
			userId: user.id,
			...values,
		});
		window.location.reload();
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
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit User</DialogTitle>
					</DialogHeader>
					<UsersTableForm
						initialData={user}
						isLoading={isUpdating}
						onFinished={() => setIsEditDialogOpen(false)}
						onSubmit={handleEditSubmit}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}

export default function UsersTable() {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const { data: users, isLoading: isLoadingUsers } =
		api.users.getAll.useQuery();

	return (
		<div className="px-4 pb-4">
			<Table>
				<TableHeader>
					<TableRow>
						{admin && <TableHead className="w-[20px]"></TableHead>}
						<TableHead className="w-[20px]">Icon</TableHead>
						<TableHead className="w-[100px]">Name</TableHead>
						<TableHead className="w-[100px]">Email</TableHead>
						<TableHead className="w-[100px]">Role</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoadingUsers && (
						<TableRow>
							<TableCell className="text-center" colSpan={6}>
								Loading...
							</TableCell>
						</TableRow>
					)}
					{users?.map((user) => (
						<TableRow key={user.id}>
							{admin && (
								<TableCell>
									<UsersTableActionsMenu user={user} />
								</TableCell>
							)}
							<TableCell>
								<Avatar>
									<AvatarImage src={user.image ?? ""} />
									<AvatarFallback>
										{user.name
											? user.name
													.split(" ")
													.map((n) => (n ?? "")[0]?.toUpperCase())
													.join("")
											: ""}
									</AvatarFallback>
								</Avatar>
							</TableCell>
							<TableCell>{user.name}</TableCell>
							<TableCell>
								<Link className="hover:underline" href={`mailto:${user.email}`}>
									{user.email}
								</Link>
							</TableCell>
							<TableCell>
								{user.role.charAt(0).toUpperCase() + user.role.slice(1)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
