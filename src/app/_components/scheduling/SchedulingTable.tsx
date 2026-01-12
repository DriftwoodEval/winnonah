"use client";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Evaluator, Office } from "~/lib/types";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ArchivedSchedulingTable } from "./ArchivedSchedulingTable";

function EvaluatorSelect({
	clientId,
	allEvaluators,
	value,
	onChange,
}: {
	clientId: number;
	allEvaluators: Evaluator[];
	value: string;
	onChange: (value: string) => void;
}) {
	const { data: eligibleEvaluators, isLoading } =
		api.evaluators.getEligibleForClient.useQuery(clientId);

	const { eligible, other } = useMemo(() => {
		if (!eligibleEvaluators || eligibleEvaluators.length === 0) {
			return { eligible: [], other: allEvaluators };
		}
		const eligibleNpis = new Set(eligibleEvaluators.map((e) => e.npi));
		const eligible = allEvaluators
			.filter((e) => eligibleNpis.has(e.npi))
			.sort((a, b) => a.providerName.localeCompare(b.providerName));
		const other = allEvaluators
			.filter((e) => !eligibleNpis.has(e.npi))
			.sort((a, b) => a.providerName.localeCompare(b.providerName));
		return { eligible, other };
	}, [allEvaluators, eligibleEvaluators]);

	return (
		<Select onValueChange={onChange} value={value}>
			<SelectTrigger>
				<SelectValue placeholder="Evaluator" />
			</SelectTrigger>
			<SelectContent>
				{isLoading ? (
					<div className="p-2 text-muted-foreground text-sm">Loading...</div>
				) : (
					<>
						{eligible.map((evaluator) => (
							<SelectItem key={evaluator.npi} value={evaluator.npi.toString()}>
								{evaluator.providerName.split(" ")[0]}
							</SelectItem>
						))}
						{eligible.length > 0 && other.length > 0 && <SelectSeparator />}
						{other.map((evaluator) => (
							<SelectItem key={evaluator.npi} value={evaluator.npi.toString()}>
								{evaluator.providerName.split(" ")[0]}
							</SelectItem>
						))}
					</>
				)}
			</SelectContent>
		</Select>
	);
}

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
	const [clientEvaluators, setClientEvaluators] = useState<
		Record<number, string>
	>({});
	const [clientOffices, setClientOffices] = useState<Record<number, string>>(
		{},
	);
	const [clientCodes, setClientCodes] = useState<Record<number, string>>({});
	const [clientScheduleDetails, setClientScheduleDetails] = useState<
		Record<number, { date: string; time: string }>
	>({});
	const [clientNotes, setClientNotes] = useState<
		Record<number, { karenNotes: string; barbaraNotes: string }>
	>({});

	useEffect(() => {
		if (data?.clients) {
			const initialEvaluators: Record<number, string> = {};
			const initialScheduleDetails: Record<
				number,
				{ date: string; time: string }
			> = {};
			const initialOffices: Record<number, string> = {};
			const initialCodes: Record<number, string> = {};
			const initialNotes: Record<
				number,
				{ karenNotes: string; barbaraNotes: string }
			> = {};
			data.clients.forEach((scheduledClient) => {
				initialEvaluators[scheduledClient.clientId] =
					scheduledClient.evaluator?.toString() ?? "";
				initialScheduleDetails[scheduledClient.clientId] = {
					date: scheduledClient.date ?? "",
					time: scheduledClient.time ?? "",
				};
				initialOffices[scheduledClient.clientId] =
					scheduledClient.office ?? scheduledClient.client.closestOffice ?? "";
				initialCodes[scheduledClient.clientId] = scheduledClient.code ?? "";
				initialNotes[scheduledClient.clientId] = {
					karenNotes: scheduledClient.karenNotes ?? "",
					barbaraNotes: scheduledClient.barbaraNotes ?? "",
				};
			});
			setClientEvaluators(initialEvaluators);
			setClientScheduleDetails(initialScheduleDetails);
			setClientOffices(initialOffices);
			setClientCodes(initialCodes);
			setClientNotes(initialNotes);
		}
	}, [data?.clients]);
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

	const clients = data?.clients || [];
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];

	const handleEvaluatorChange = (clientId: number, evaluatorNpi: string) => {
		setClientEvaluators((prev) => ({ ...prev, [clientId]: evaluatorNpi }));
		updateMutation.mutate({
			clientId,
			evaluatorNpi: evaluatorNpi ? parseInt(evaluatorNpi, 10) : null,
		});
	};

	const handleOfficeChange = (clientId: number, office: string) => {
		setClientOffices((prev) => ({ ...prev, [clientId]: office }));
		updateMutation.mutate({
			clientId,
			office,
		});
	};

	const handleCodeChange = (clientId: number, code: string) => {
		setClientCodes((prev) => ({ ...prev, [clientId]: code }));
		updateMutation.mutate({
			clientId,
			code,
		});
	};

	const handleScheduleDetailChange = (
		clientId: number,
		field: "date" | "time",
		value: string,
	) => {
		setClientScheduleDetails((prev) => ({
			...prev,
			[clientId]: {
				...(prev[clientId] ?? { date: "", time: "" }),
				[field]: value,
			},
		}));
	};

	const handleNotesChange = (
		clientId: number,
		field: "karenNotes" | "barbaraNotes",
		value: string,
	) => {
		setClientNotes((prev) => ({
			...prev,
			[clientId]: {
				...(prev[clientId] ?? { karenNotes: "", barbaraNotes: "" }),
				[field]: value,
			},
		}));
	};

	const handleArchive = (clientId: number) => {
		archiveMutation.mutate({ clientId });
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
				{clients.map((scheduledClient) => (
					<TableRow className="hover:bg-inherit" key={scheduledClient.clientId}>
						<TableCell>
							<Link
								className="hover:underline"
								href={`/clients/${scheduledClient.client.hash}`}
							>
								{scheduledClient.client.fullName}
							</Link>
						</TableCell>

						<TableCell>
							<EvaluatorSelect
								allEvaluators={evaluators}
								clientId={scheduledClient.clientId}
								onChange={(value) =>
									handleEvaluatorChange(scheduledClient.clientId, value)
								}
								value={clientEvaluators[scheduledClient.clientId] ?? ""}
							/>
						</TableCell>

						<TableCell className="min-w-[100px]">
							<Input
								onBlur={() =>
									updateMutation.mutate({
										clientId: scheduledClient.clientId,
										date: clientScheduleDetails[scheduledClient.clientId]?.date,
									})
								}
								onChange={(e) =>
									handleScheduleDetailChange(
										scheduledClient.clientId,
										"date",
										e.target.value,
									)
								}
								value={
									clientScheduleDetails[scheduledClient.clientId]?.date ?? ""
								}
							/>
						</TableCell>

						<TableCell className="min-w-[100px]">
							<Input
								onBlur={() =>
									updateMutation.mutate({
										clientId: scheduledClient.clientId,
										time: clientScheduleDetails[scheduledClient.clientId]?.time,
									})
								}
								onChange={(e) =>
									handleScheduleDetailChange(
										scheduledClient.clientId,
										"time",
										e.target.value,
									)
								}
								value={
									clientScheduleDetails[scheduledClient.clientId]?.time ?? ""
								}
							/>
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
							<Select
								onValueChange={(value) =>
									handleCodeChange(scheduledClient.clientId, value)
								}
								value={clientCodes[scheduledClient.clientId] ?? ""}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select Code" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="90791">90791</SelectItem>
									<SelectItem value="96136">96136</SelectItem>
								</SelectContent>
							</Select>
						</TableCell>

						<TableCell className="min-w-fit">
							<Select
								onValueChange={(value) =>
									handleOfficeChange(scheduledClient.clientId, value)
								}
								value={clientOffices[scheduledClient.clientId] ?? ""}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select Office" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Virtual">Virtual</SelectItem>
									{offices.map((office) => (
										<SelectItem key={office.key} value={office.key}>
											{office.prettyName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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

						<TableCell className="min-w-[300px]">
							<Input
								onBlur={() =>
									updateMutation.mutate({
										clientId: scheduledClient.clientId,
										karenNotes:
											clientNotes[scheduledClient.clientId]?.karenNotes,
									})
								}
								onChange={(e) =>
									handleNotesChange(
										scheduledClient.clientId,
										"karenNotes",
										e.target.value,
									)
								}
								value={clientNotes[scheduledClient.clientId]?.karenNotes ?? ""}
							/>
						</TableCell>
						<TableCell className="min-w-[300px]">
							<Input
								onBlur={() =>
									updateMutation.mutate({
										clientId: scheduledClient.clientId,
										barbaraNotes:
											clientNotes[scheduledClient.clientId]?.barbaraNotes,
									})
								}
								onChange={(e) =>
									handleNotesChange(
										scheduledClient.clientId,
										"barbaraNotes",
										e.target.value,
									)
								}
								value={
									clientNotes[scheduledClient.clientId]?.barbaraNotes ?? ""
								}
							/>
						</TableCell>

						<TableCell>
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
						</TableCell>
					</TableRow>
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
