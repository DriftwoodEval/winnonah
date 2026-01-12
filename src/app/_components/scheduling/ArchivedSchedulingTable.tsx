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
import { ArchiveRestore, Circle, Loader2 } from "lucide-react";
import Link from "next/link";
import {
	isSchedulingColor,
	SCHEDULING_COLOR_MAP,
	type SchedulingColor,
} from "~/lib/scheduling-colors";
import type { Evaluator, Office } from "~/lib/types";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
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
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];

	const handleUnarchive = (clientId: number) => {
		unarchiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-inherit">
					<TableHead>Name</TableHead>
					<TableHead>Evaluator</TableHead>
					<TableHead>Date</TableHead>
					<TableHead>Time</TableHead>
					<TableHead>ASD/ADHD</TableHead>
					<TableHead>Insurance</TableHead>
					<TableHead>Code</TableHead>
					<TableHead>Location</TableHead>
					<TableHead>District</TableHead>
					<TableHead>PA Date</TableHead>
					<TableHead>Age</TableHead>
					<TableHead>Karen Notes</TableHead>
					<TableHead>Barbara Notes</TableHead>
					<TableHead>Actions</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{clients.map((scheduledClient) => {
					const color =
						scheduledClient.color && isSchedulingColor(scheduledClient.color)
							? (scheduledClient.color as SchedulingColor)
							: null;
					const backgroundColor = color
						? `${SCHEDULING_COLOR_MAP[color]}10`
						: "transparent";

					const evaluator = evaluators.find(
						(e) => e.npi === scheduledClient.evaluator,
					);
					const office = offices.find((o) => o.key === scheduledClient.office);

					return (
						<TableRow
							className="hover:bg-inherit"
							key={scheduledClient.clientId}
							style={{ backgroundColor }}
						>
							<TableCell>
								<div className="flex items-center gap-2">
									{color && (
										<Circle
											className="h-4 w-4"
											fill={SCHEDULING_COLOR_MAP[color]}
											style={{ color: SCHEDULING_COLOR_MAP[color] }}
										/>
									)}
									<Link
										className="hover:underline"
										href={`/clients/${scheduledClient.client.hash}`}
									>
										{scheduledClient.client.fullName}
									</Link>
								</div>
							</TableCell>

							<TableCell>{evaluator?.providerName.split(" ")[0] ?? "-"}</TableCell>

							<TableCell>{scheduledClient.date || "-"}</TableCell>

							<TableCell>{scheduledClient.time || "-"}</TableCell>

							<TableCell>{scheduledClient.client.asdAdhd ?? "-"}</TableCell>

							<TableCell>
								{[
									scheduledClient.client.primaryInsurance,
									scheduledClient.client.secondaryInsurance,
								]
									.filter(Boolean)
									.join(" | ") || "-"}
							</TableCell>

							<TableCell>{scheduledClient.code || "-"}</TableCell>

							<TableCell>
								{scheduledClient.office === "Virtual"
									? "Virtual"
									: office?.prettyName ||
										scheduledClient.client.closestOffice ||
										"-"}
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
									? getLocalDayFromUTCDate(
											scheduledClient.client.precertExpires,
										)?.toLocaleDateString()
									: "-"}
							</TableCell>

							<TableCell>
								{scheduledClient.client.dob
									? formatClientAge(scheduledClient.client.dob)
									: ""}
							</TableCell>

							<TableCell className="max-w-[300px] truncate">
								{scheduledClient.karenNotes || "-"}
							</TableCell>

							<TableCell className="max-w-[300px] truncate">
								{scheduledClient.barbaraNotes || "-"}
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
					);
				})}
			</TableBody>
		</Table>
	);
}