"use client";

import { Button } from "@components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@components/ui/table";
import { Skeleton } from "@ui/skeleton";
import { ArchiveRestore, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "~/trpc/react";

export function ArchivedSchedulingTable() {
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

	const clients = data?.clients || [];

	const handleUnarchive = (clientId: number) => {
		unarchiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-inherit">
					{/* TODO: Add rest of columns read-only */}
					<TableHead>Name</TableHead>
					<TableHead>ASD/ADHD</TableHead>
					<TableHead>Insurance</TableHead>
					<TableHead>District</TableHead>
					<TableHead>PA Date</TableHead>
					<TableHead>Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{clients.map((scheduledClient) => (
					<TableRow key={scheduledClient.clientId}>
						<TableCell>
							<Link href={`/clients/${scheduledClient.client.hash}`}>
								{scheduledClient.client.fullName}
							</Link>
						</TableCell>

						<TableCell>{scheduledClient.client.asdAdhd ?? "-"}</TableCell>

						<TableCell>
							{[
								scheduledClient.client.primaryInsurance,
								scheduledClient.client.secondaryInsurance,
							]
								.filter(Boolean)
								.join(" | ") || "-"}
						</TableCell>

						<TableCell>
							{scheduledClient.client.schoolDistrict
								? scheduledClient.client.schoolDistrict
										?.replace(/ County School District$/, "")
										.replace(/ School District$/, "")
								: "-"}
						</TableCell>

						<TableCell>
							{scheduledClient.client.precertExpires
								? new Date(
										scheduledClient.client.precertExpires,
									).toLocaleDateString()
								: "-"}
						</TableCell>

						<TableCell>
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
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
