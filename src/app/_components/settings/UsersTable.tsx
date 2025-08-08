"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { checkRole } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export default function UsersTable() {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const { data: users, isLoading: isLoadingUsers } =
		api.users.getAll.useQuery();

	console.log(users);

	return (
		<div className="px-4 pb-4">
			<Table>
				<TableHeader>
					<TableRow>
						{/* <TableHead className="w-[20px]"></TableHead> */}
						<TableHead className="w-[20px]"></TableHead>
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
							{/* {admin && (
									<TableCell>
										<UsersTableActionsMenu questionnaire={questionnaire} />
									</TableCell>
								)} */}
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
								<Link href={`mailto:${user.email}`}>{user.email}</Link>
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
