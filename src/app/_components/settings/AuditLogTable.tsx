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
import { Skeleton } from "@ui/skeleton";
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
const SKELETON_ROWS = ["a", "b", "c", "d", "e"];

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
	const { data, isPending } = api.auditLog.list.useQuery(
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

	type AuditRow = (typeof rows)[number];

	const formatTime = (row: AuditRow) =>
		formatInBusinessTime(row.createdAt, "M/d/yy h:mm a");

	const renderUser = (row: AuditRow) => (
		<>
			{row.userName ?? row.userEmail}
			{row.impersonatedBy && (
				<span className="block text-muted-foreground text-xs">
					impersonated by {row.impersonatedBy}
				</span>
			)}
		</>
	);

	const toggleExpanded = (id: number) =>
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	const renderAction = (row: AuditRow) => {
		const detail = formatDetail(row.detail);
		const expanded = expandedRows.has(row.id);
		return (
			<>
				<Badge variant="outline">{row.action}</Badge>
				{detail && (
					<button
						className={`block max-w-md text-left text-muted-foreground text-xs ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}
						onClick={() => toggleExpanded(row.id)}
						title={expanded ? undefined : "Click to expand"}
						type="button"
					>
						{detail}
					</button>
				)}
			</>
		);
	};

	const renderClient = (row: AuditRow) =>
		row.clientId && row.clientHash ? (
			<Link className="hover:underline" href={`/clients/${row.clientHash}`}>
				{row.clientFirstName} {row.clientLastName}
			</Link>
		) : (
			<span className="text-muted-foreground">—</span>
		);

	const renderStatus = (row: AuditRow) =>
		row.success ? (
			<Badge variant="outline">Success</Badge>
		) : (
			<Badge title={row.errorMessage ?? ""} variant="destructive">
				Failed
			</Badge>
		);

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
					<SelectTrigger className="w-full sm:w-[200px]">
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
					onValueChange={resetAndSet<string>((value) =>
						setAction(value === "all" ? "" : value),
					)}
					value={action || "all"}
				>
					<SelectTrigger className="w-full sm:w-[240px]">
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
					<div className="w-full sm:w-[240px]">
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

			<div className="hidden overflow-x-auto md:block">
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
						{isPending ? (
							SKELETON_ROWS.map((key) => (
								<TableRow key={key}>
									<TableCell colSpan={5}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							))
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell className="text-center" colSpan={5}>
									No audit log entries found.
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="whitespace-nowrap">
										{formatTime(row)}
									</TableCell>
									<TableCell>{renderUser(row)}</TableCell>
									<TableCell>{renderAction(row)}</TableCell>
									<TableCell>{renderClient(row)}</TableCell>
									<TableCell>{renderStatus(row)}</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<div className="flex flex-col gap-2 md:hidden">
				{isPending ? (
					SKELETON_ROWS.map((key) => (
						<Skeleton className="h-16 w-full rounded-lg" key={key} />
					))
				) : rows.length === 0 ? (
					<p className="py-4 text-center text-sm">
						No audit log entries found.
					</p>
				) : (
					rows.map((row) => (
						<div
							className="space-y-1.5 rounded-lg border p-3 text-sm"
							key={row.id}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-muted-foreground text-xs">
									{formatTime(row)}
								</span>
								{renderStatus(row)}
							</div>
							<div>{renderUser(row)}</div>
							<div>{renderAction(row)}</div>
							<div>{renderClient(row)}</div>
						</div>
					))
				)}
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
