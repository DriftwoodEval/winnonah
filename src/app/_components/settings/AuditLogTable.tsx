"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
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
import Link from "next/link";
import { useState } from "react";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

const PAGE_SIZE = 50;

function changedFields(detail: unknown): string | null {
	if (
		typeof detail === "object" &&
		detail !== null &&
		"fields" in detail &&
		Array.isArray((detail as { fields: unknown }).fields)
	) {
		return (detail as { fields: string[] }).fields.join(", ");
	}
	return null;
}

export default function AuditLogTable() {
	const [userId, setUserId] = useState<string | undefined>(undefined);
	const [action, setAction] = useState("");
	const [offset, setOffset] = useState(0);

	const { data: users } = api.users.getAll.useQuery();
	const { data } = api.auditLog.list.useQuery({
		userId,
		action: action || undefined,
		limit: PAGE_SIZE,
		offset,
	});

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;

	function resetAndSet<T>(setter: (value: T) => void) {
		return (value: T) => {
			setOffset(0);
			setter(value);
		};
	}

	return (
		<div className="space-y-4 px-4">
			<h3 className="font-bold text-lg">Audit Log</h3>

			<div className="flex flex-wrap gap-2">
				<Select
					onValueChange={resetAndSet<string | undefined>((value) =>
						setUserId(value === "all" ? undefined : value),
					)}
					value={userId ?? "all"}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="All users" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All users</SelectItem>
						{users?.map((user) => (
							<SelectItem key={user.id} value={user.id}>
								{user.name ?? user.email}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Input
					className="w-[200px]"
					onChange={(e) => resetAndSet<string>(setAction)(e.target.value)}
					placeholder="Filter by action..."
					value={action}
				/>
			</div>

			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							<TableHead>User</TableHead>
							<TableHead>Action</TableHead>
							<TableHead>Client</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell className="text-center" colSpan={5}>
									No audit log entries found.
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="whitespace-nowrap">
										{formatInBusinessTime(row.createdAt, "M/d/yy h:mm a")}
									</TableCell>
									<TableCell>
										{row.userName ?? row.userEmail}
										{row.impersonatedBy && (
											<span className="block text-muted-foreground text-xs">
												impersonated by {row.impersonatedBy}
											</span>
										)}
									</TableCell>
									<TableCell>
										<Badge variant="outline">{row.action}</Badge>
										{changedFields(row.detail) && (
											<span className="block text-muted-foreground text-xs">
												fields: {changedFields(row.detail)}
											</span>
										)}
									</TableCell>
									<TableCell>
										{row.clientId && row.clientHash ? (
											<Link
												className="hover:underline"
												href={`/clients/${row.clientHash}`}
											>
												{row.clientFirstName} {row.clientLastName}
											</Link>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell>
										{row.success ? (
											<Badge variant="outline">Success</Badge>
										) : (
											<Badge
												title={row.errorMessage ?? ""}
												variant="destructive"
											>
												Failed
											</Badge>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-sm">
					{total > 0
						? `${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`
						: null}
				</span>
				<div className="flex gap-2">
					<Button
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<Button
						disabled={offset + PAGE_SIZE >= total}
						onClick={() => setOffset(offset + PAGE_SIZE)}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
