"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
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
import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ClientSearchAndAdd } from "../clients/ClientSearchAndAdd";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";

const RUN_PAGE_SIZE = 25;
const LINE_PAGE_SIZE = 200;
const SKELETON_ROWS = ["a", "b", "c", "d", "e"];
const LEVELS = ["DEBUG", "INFO", "NOTICE", "WARNING", "ERROR"] as const;
type Level = (typeof LEVELS)[number];

type ClientFilter = { id: number; fullName: string } | null;

function ClientFilterControl({
	client,
	onChange,
}: {
	client: ClientFilter;
	onChange: (client: ClientFilter) => void;
}) {
	if (client) {
		return (
			<Button
				className="gap-1"
				onClick={() => onChange(null)}
				variant="outline"
			>
				{client.fullName}
				<X className="h-4 w-4" />
			</Button>
		);
	}
	return (
		<div className="w-full sm:w-[240px]">
			<ClientSearchAndAdd
				addButtonLabel="Filter"
				floating
				onAdd={(c) => onChange({ id: c.id, fullName: c.fullName })}
				placeholder="Filter by client..."
				status="all"
			/>
		</div>
	);
}

function levelBadge(level: string) {
	if (level === "ERROR" || level === "CRITICAL") {
		return <Badge variant="destructive">{level}</Badge>;
	}
	if (level === "WARNING") {
		return (
			<Badge className="border-warning/40 text-warning" variant="outline">
				{level}
			</Badge>
		);
	}
	return <Badge variant="outline">{level}</Badge>;
}

function Pager({
	offset,
	pageSize,
	total,
	onChange,
}: {
	offset: number;
	pageSize: number;
	total: number;
	onChange: (offset: number) => void;
}) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-muted-foreground text-sm">
				{total > 0
					? `${offset + 1}-${Math.min(offset + pageSize, total)} of ${total}`
					: null}
			</span>
			<div className="flex gap-2">
				<Button
					disabled={offset === 0}
					onClick={() => onChange(Math.max(0, offset - pageSize))}
					size="sm"
					variant="outline"
				>
					Previous
				</Button>
				<Button
					disabled={offset + pageSize >= total}
					onClick={() => onChange(offset + pageSize)}
					size="sm"
					variant="outline"
				>
					Next
				</Button>
			</div>
		</div>
	);
}

function RunLines({
	runId,
	initialClient,
	onBack,
}: {
	/** Undefined lists lines from every run, with a Script column and no client filter. */
	runId?: string;
	initialClient: ClientFilter;
	onBack: () => void;
}) {
	const [client, setClient] = useState<ClientFilter>(initialClient);
	const [minLevel, setMinLevel] = useState<Level>("INFO");
	const [offset, setOffset] = useState(0);

	const { data, isPending, isError, refetch } = api.runLogs.listLines.useQuery(
		{
			runId,
			clientId: client?.id,
			minLevel,
			limit: LINE_PAGE_SIZE,
			offset,
		},
		{ placeholderData: (previousData) => previousData },
	);
	const rows = data?.rows ?? [];

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Button onClick={onBack} size="sm" variant="outline">
					<ArrowLeft className="h-4 w-4" />
					Runs
				</Button>
				<Select
					onValueChange={(value) => {
						setOffset(0);
						setMinLevel(value as Level);
					}}
					value={minLevel}
				>
					<SelectTrigger className="w-full sm:w-[180px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent position="popper">
						{LEVELS.map((level) => (
							<SelectItem key={level} value={level}>
								{level} and above
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{runId && (
					<ClientFilterControl
						client={client}
						onChange={(next) => {
							setOffset(0);
							setClient(next);
						}}
					/>
				)}
			</div>

			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Time</TableHead>
							{!runId && <TableHead>Script</TableHead>}
							<TableHead>Level</TableHead>
							<TableHead>Client</TableHead>
							<TableHead>Message</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isPending ? (
							SKELETON_ROWS.map((key) => (
								<TableRow key={key}>
									<TableCell colSpan={runId ? 4 : 5}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							))
						) : isError ? (
							<TableRow>
								<TableCell colSpan={runId ? 4 : 5}>
									<ErrorState compact onRetry={refetch} />
								</TableCell>
							</TableRow>
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={runId ? 4 : 5}>
									<EmptyState compact title="No log lines found" />
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="whitespace-nowrap align-top">
										{formatInBusinessTime(
											row.time,
											runId ? "h:mm:ss a" : "M/d/yy h:mm:ss a",
										)}
									</TableCell>
									{!runId && (
										<TableCell className="align-top">
											<Badge variant="outline">{row.app}</Badge>
										</TableCell>
									)}
									<TableCell className="align-top">
										{levelBadge(row.level)}
									</TableCell>
									<TableCell className="align-top">
										{row.clientId && row.clientHash ? (
											<Link
												className="hover:underline"
												href={`/clients/${row.clientHash}`}
											>
												<ClientHoverCard clientHash={row.clientHash}>
													{row.clientFirstName} {row.clientLastName}
												</ClientHoverCard>
											</Link>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="whitespace-pre-wrap break-words">
										{row.message}
										<span className="block text-muted-foreground text-xs">
											{row.source}
										</span>
										{row.exception && (
											<pre className="mt-1 max-w-3xl overflow-x-auto text-xs">
												{row.exception}
											</pre>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
			<Pager
				offset={offset}
				onChange={setOffset}
				pageSize={LINE_PAGE_SIZE}
				total={data?.total ?? 0}
			/>
		</div>
	);
}

export default function RunLogsTable({
	lockedClient = null,
}: {
	/** Pins the list to one client (client page): hides the heading and client filter. */
	lockedClient?: ClientFilter;
}) {
	const [app, setApp] = useState<string | undefined>(undefined);
	const [client, setClient] = useState<ClientFilter>(lockedClient);
	const [offset, setOffset] = useState(0);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [showAllLines, setShowAllLines] = useState(false);

	const { data: apps } = api.runLogs.listApps.useQuery();
	const { data, isPending, isError, refetch } = api.runLogs.listRuns.useQuery(
		{ app, clientId: client?.id, limit: RUN_PAGE_SIZE, offset },
		{ placeholderData: (previousData) => previousData },
	);
	const rows = data?.rows ?? [];

	if (selectedRunId || showAllLines) {
		return (
			<div className="space-y-4 px-4">
				<h3 className="font-bold text-lg">Run Logs</h3>
				<RunLines
					initialClient={client}
					onBack={() => {
						setSelectedRunId(null);
						setShowAllLines(false);
					}}
					runId={selectedRunId ?? undefined}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4 px-4">
			{!lockedClient && <h3 className="font-bold text-lg">Run Logs</h3>}

			<div className="flex flex-wrap gap-2">
				<Select
					onValueChange={(value) => {
						setOffset(0);
						setApp(value === "all" ? undefined : value);
					}}
					value={app ?? "all"}
				>
					<SelectTrigger className="w-full sm:w-[200px]">
						<SelectValue placeholder="All scripts" />
					</SelectTrigger>
					<SelectContent position="popper">
						<SelectItem value="all">All scripts</SelectItem>
						{apps?.map((name) => (
							<SelectItem key={name} value={name}>
								{name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{!lockedClient && (
					<ClientFilterControl
						client={client}
						onChange={(next) => {
							setOffset(0);
							setClient(next);
						}}
					/>
				)}
				{lockedClient && (
					<Button onClick={() => setShowAllLines(true)} variant="outline">
						View all lines
					</Button>
				)}
			</div>

			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Started</TableHead>
							<TableHead>Script</TableHead>
							<TableHead>Duration</TableHead>
							<TableHead>Clients</TableHead>
							<TableHead>Errors</TableHead>
							<TableHead>Warnings</TableHead>
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
									<EmptyState compact title="No runs found" />
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow
									className="cursor-pointer"
									key={row.id}
									onClick={() => setSelectedRunId(row.id)}
								>
									<TableCell className="whitespace-nowrap">
										{formatInBusinessTime(row.startedAt, "M/d/yy h:mm a")}
									</TableCell>
									<TableCell>
										<Badge variant="outline">{row.app}</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap">
										{Math.max(
											1,
											Math.round(
												(row.lastLogAt.getTime() - row.startedAt.getTime()) /
													60_000,
											),
										)}{" "}
										min
									</TableCell>
									<TableCell>{row.clientCount}</TableCell>
									<TableCell>
										{Number(row.errorCount) > 0 ? (
											<Badge variant="destructive">{row.errorCount}</Badge>
										) : (
											0
										)}
									</TableCell>
									<TableCell>{row.warningCount}</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
			<Pager
				offset={offset}
				onChange={setOffset}
				pageSize={RUN_PAGE_SIZE}
				total={data?.total ?? 0}
			/>
		</div>
	);
}
