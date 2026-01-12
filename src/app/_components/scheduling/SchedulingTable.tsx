"use client";

import { Button } from "@components/ui/button";
import { Table, TableBody, TableHeader } from "@components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { ArchiveRestore, Loader2, X } from "lucide-react";
import type { Evaluator, Office } from "~/lib/types";
import { api } from "~/trpc/react";
import {
	type ScheduledClient,
	SchedulingTableHeader,
	SchedulingTableRow,
} from "./SchedulingTableBase";

function ActiveSchedulingTable() {
	const utils = api.useUtils();
	const { data, isLoading, error, refetch } = api.scheduling.get.useQuery();
	const updateMutation = api.scheduling.update.useMutation({
		onSuccess: () => {
			refetch();
		},
	});
	const archiveMutation = api.scheduling.archive.useMutation({
		onSuccess: () => {
			refetch();
			utils.scheduling.getArchived.invalidate();
		},
	});

	if (isLoading) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{Array.from({ length: 5 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: it's just a skeleton
					<Skeleton className="h-10 w-full" key={i} />
				))}
			</div>
		);
	}

	if (error) return <div>Error: {error.message}</div>;

	const clients = (data?.clients || []) as ScheduledClient[];
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];

	const handleUpdate = (clientId: number, updateData: any) => {
		updateMutation.mutate({ clientId, ...updateData });
	};

	const handleArchive = (clientId: number) => {
		archiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<SchedulingTableHeader />
			</TableHeader>
			<TableBody>
				{clients.map((scheduledClient) => (
					<SchedulingTableRow
						actions={
							<Button
								disabled={archiveMutation.isPending}
								onClick={() => handleArchive(scheduledClient.clientId)}
								size="sm"
								variant="destructive"
							>
								{archiveMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<X />
								)}
							</Button>
						}
						evaluators={evaluators}
						isEditable={true}
						key={scheduledClient.clientId}
						offices={offices}
						onUpdate={handleUpdate}
						scheduledClient={scheduledClient}
					/>
				))}
			</TableBody>
		</Table>
	);
}

function ArchivedSchedulingTable() {
	const utils = api.useUtils();
	const { data, isLoading, error, refetch } =
		api.scheduling.getArchived.useQuery();
	const unarchiveMutation = api.scheduling.unarchive.useMutation({
		onSuccess: () => {
			refetch();
			utils.scheduling.get.invalidate();
		},
	});

	if (isLoading)
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{Array.from({ length: 5 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: it's just a skeleton
					<Skeleton className="h-10 w-full" key={i} />
				))}
			</div>
		);
	if (error) return <div>Error: {error.message}</div>;

	const clients = (data?.clients || []) as ScheduledClient[];
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];

	const handleUnarchive = (clientId: number) => {
		unarchiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<SchedulingTableHeader />
			</TableHeader>
			<TableBody>
				{clients.map((scheduledClient) => (
					<SchedulingTableRow
						actions={
							<Button
								disabled={unarchiveMutation.isPending}
								onClick={() => handleUnarchive(scheduledClient.clientId)}
								size="sm"
								variant="default"
							>
								{unarchiveMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<ArchiveRestore />
								)}
							</Button>
						}
						evaluators={evaluators}
						isEditable={false}
						key={scheduledClient.clientId}
						offices={offices}
						scheduledClient={scheduledClient}
					/>
				))}
			</TableBody>
		</Table>
	);
}

export function SchedulingTable() {
	return (
		<Tabs defaultValue="active">
			<TabsList>
				<TabsTrigger value="active">Active</TabsTrigger>
				<TabsTrigger value="archived">Archived</TabsTrigger>
			</TabsList>
			<TabsContent value="active">
				<ActiveSchedulingTable />
			</TabsContent>
			<TabsContent value="archived">
				<ArchivedSchedulingTable />
			</TabsContent>
		</Tabs>
	);
}
