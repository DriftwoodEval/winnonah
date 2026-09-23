"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
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
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ClientSearchAndAdd } from "../clients/ClientSearchAndAdd";

const PAGE_SIZE = 50;

/**
 * Actions are dot-namespaced (e.g. "internal.failure.update"). Groups them
 * by that leading namespace so the filter can offer both an exact action
 * and a "<namespace>.*" option that matches every action in the namespace.
 */
function groupActionsByCategory(actionNames: string[]) {
	const byCategory = new Map<string, string[]>();
	for (const name of actionNames) {
		const category = name.split(".")[0] ?? name;
		const names = byCategory.get(category) ?? [];
		names.push(name);
		byCategory.set(category, names);
	}
	return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatDetail(detail: unknown): string | null {
	if (detail === null || detail === undefined) return null;
	if (typeof detail === "object") {
		return Object.entries(detail as Record<string, unknown>)
			.map(([field, value]) => `${field}: ${JSON.stringify(value)}`)
			.join(", ");
	}
	return JSON.stringify(detail);
}

export default function AuditLogTable() {
	const [userId, setUserId] = useState<string | undefined>(undefined);
	const [action, setAction] = useState("");
	const [client, setClient] = useState<{ id: number; fullName: string } | null>(
		null,
	);
	const [offset, setOffset] = useState(0);
	const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

	const { data: auditUsers } = api.auditLog.getDistinctUsers.useQuery();
	const { data: actionNames } = api.auditLog.getActionNames.useQuery();
	const { data } = api.auditLog.list.useQuery(
		{
			userId,
			action: action || undefined,
			clientId: client?.id,
			limit: PAGE_SIZE,
			offset,
		},
		// Keeps the previous rows on screen while a new filter is in flight,
		// instead of the table flashing empty on every keystroke.
		{ placeholderData: (previousData) => previousData },
	);

	const rows = data?.rows ?? [];
	const total = data?.total ?? 0;
	const actionCategories = groupActionsByCategory(actionNames ?? []);

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
					onValueChange={(v) =>
						v !== null &&
						resetAndSet<string | undefined>((value) =>
							setUserId(value === "all" ? undefined : value),
						)(v)
					}
					value={userId ?? "all"}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder="All users" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All users</SelectItem>
						{auditUsers?.map((user) => (
							<SelectItem key={user.userId} value={user.userId}>
								{user.userName ?? user.userEmail}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					onValueChange={(v) =>
						v !== null &&
						resetAndSet<string>((value) =>
							setAction(value === "all" ? "" : value),
						)(v)
					}
					value={action || "all"}
				>
					<SelectTrigger className="w-[240px]">
						<SelectValue placeholder="All actions" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All actions</SelectItem>
						{actionCategories.map(([category, names]) => (
							<SelectGroup key={category}>
								<SelectLabel>{category}</SelectLabel>
								<SelectItem value={`${category}.*`}>
									All {category}.*
								</SelectItem>
								{names.map((name) => (
									<SelectItem key={name} value={name}>
										{name}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>

				{client ? (
					<Button
						className="gap-1"
						onClick={() => resetAndSet(setClient)(null)}
						variant="outline"
					>
						{client.fullName}
						<X className="h-4 w-4" />
					</Button>
				) : (
					<div className="w-[240px]">
						<ClientSearchAndAdd
							addButtonLabel="Filter"
							floating
							onAdd={(c) =>
								resetAndSet(setClient)({ id: c.id, fullName: c.fullName })
							}
							placeholder="Filter by client..."
							status="all"
						/>
					</div>
				)}
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
										{formatDetail(row.detail) &&
											(expandedRows.has(row.id) ? (
												<button
													className="block max-w-md whitespace-pre-wrap break-words text-left text-muted-foreground text-xs"
													onClick={() =>
														setExpandedRows((prev) => {
															const next = new Set(prev);
															next.delete(row.id);
															return next;
														})
													}
													type="button"
												>
													{formatDetail(row.detail)}
												</button>
											) : (
												<button
													className="block max-w-md truncate text-left text-muted-foreground text-xs"
													onClick={() =>
														setExpandedRows((prev) => new Set(prev).add(row.id))
													}
													title="Click to expand"
													type="button"
												>
													{formatDetail(row.detail)}
												</button>
											))}
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
