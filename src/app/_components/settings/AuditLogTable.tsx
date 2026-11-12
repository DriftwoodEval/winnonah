"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { Redact } from "@components/redaction/Redact";
import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
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
import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { Fragment, type MouseEvent, useState } from "react";
import { cn, formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AuditDetail, actionLabel, summarizeDetail } from "./AuditDetail";

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
	const { data, isPending, isError, refetch } = api.auditLog.list.useQuery(
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
				<span className="block text-xs text-muted-foreground">
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

	/** Whether opening the row would show anything: recorded detail or a failure message. */
	const hasDetail = (row: AuditRow) =>
		(row.detail !== null && row.detail !== undefined) ||
		(!row.success && !!row.errorMessage);

	/** Click props that make a whole row toggle its detail; clicks on links (the client name) navigate instead. */
	const rowToggleProps = (row: AuditRow) =>
		hasDetail(row)
			? {
					className: "cursor-pointer",
					onClick: (event: MouseEvent) => {
						if ((event.target as HTMLElement).closest("a")) return;
						toggleExpanded(row.id);
					},
				}
			: {};

	const renderAction = (row: AuditRow) => {
		const summary =
			expandedRows.has(row.id) || !hasDetail(row)
				? null
				: summarizeDetail(row.detail);
		return (
			<>
				<span className="font-medium" title={row.action}>
					{actionLabel(row.action)}
				</span>
				{summary && (
					<span className="mt-1 block max-w-md truncate text-xs text-muted-foreground">
						<Redact>{summary}</Redact>
					</span>
				)}
			</>
		);
	};

	const renderExpanded = (row: AuditRow) => (
		<div className="space-y-3">
			{!row.success && row.errorMessage && (
				<p className="text-sm text-destructive">{row.errorMessage}</p>
			)}
			<AuditDetail detail={row.detail} />
		</div>
	);

	// The click bubbles to the row's own handler; the button is the keyboard path.
	const renderToggle = (row: AuditRow) =>
		hasDetail(row) && (
			<button
				aria-expanded={expandedRows.has(row.id)}
				aria-label={`${expandedRows.has(row.id) ? "Hide" : "Show"} detail for ${row.action}`}
				className="rounded p-1 text-muted-foreground hover:bg-muted"
				type="button"
			>
				<ChevronRight
					className={`h-4 w-4 transition-transform ${expandedRows.has(row.id) ? "rotate-90" : ""}`}
				/>
			</button>
		);

	const renderClient = (row: AuditRow) =>
		row.clientId && row.clientHash ? (
			<Link className="hover:underline" href={`/clients/${row.clientHash}`}>
				<ClientHoverCard clientHash={row.clientHash}>
					<Redact>{`${row.clientFirstName} ${row.clientLastName}`}</Redact>
				</ClientHoverCard>
			</Link>
		) : (
			<span className="text-muted-foreground">None</span>
		);

	const renderStatus = (row: AuditRow) =>
		row.success ? (
			<Badge variant="success">Success</Badge>
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
			<h3 className="text-lg font-bold">Audit Log</h3>

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
					<SelectContent position="popper">
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
					<SelectContent position="popper">
						<SelectItem value="all">All actions</SelectItem>
						{actionCategories.map(([category, names]) => (
							<SelectGroup key={category}>
								<SelectLabel>{category}</SelectLabel>
								<SelectItem value={`${category}.*`}>All {category}</SelectItem>
								{names.map((name) => (
									<SelectItem key={name} value={name}>
										{actionLabel(name)}
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
						<Redact>{client.fullName}</Redact>
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
							<TableHead className="w-8" />
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
									<TableCell colSpan={6}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							))
						) : isError ? (
							<TableRow>
								<TableCell colSpan={6}>
									<ErrorState compact onRetry={refetch} />
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6}>
									<EmptyState compact title="No audit log entries found" />
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<Fragment key={row.id}>
									<TableRow {...rowToggleProps(row)}>
										<TableCell>{renderToggle(row)}</TableCell>
										<TableCell className="whitespace-nowrap">
											{formatTime(row)}
										</TableCell>
										<TableCell>{renderUser(row)}</TableCell>
										<TableCell>{renderAction(row)}</TableCell>
										<TableCell>{renderClient(row)}</TableCell>
										<TableCell>{renderStatus(row)}</TableCell>
									</TableRow>
									{expandedRows.has(row.id) && (
										<TableRow className="bg-muted/30 hover:bg-muted/30">
											<TableCell />
											<TableCell colSpan={5}>{renderExpanded(row)}</TableCell>
										</TableRow>
									)}
								</Fragment>
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
				) : isError ? (
					<ErrorState compact onRetry={refetch} />
				) : rows.length === 0 ? (
					<EmptyState compact title="No audit log entries found" />
				) : (
					rows.map((row) => (
						// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the chevron button inside is the keyboard path
						<div
							className={cn(
								"space-y-1.5 rounded-lg border p-3 text-sm",
								rowToggleProps(row).className,
							)}
							key={row.id}
							onClick={rowToggleProps(row).onClick}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="text-xs text-muted-foreground">
									{formatTime(row)}
								</span>
								{renderStatus(row)}
							</div>
							<div className="flex items-start justify-between gap-2">
								<div>{renderUser(row)}</div>
								<div className="text-right">{renderClient(row)}</div>
							</div>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">{renderAction(row)}</div>
								{renderToggle(row)}
							</div>
							{expandedRows.has(row.id) && (
								<div className="border-t pt-2">{renderExpanded(row)}</div>
							)}
						</div>
					))
				)}
			</div>

			<div className="flex items-center justify-between">
				<span className="text-sm text-muted-foreground">
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
