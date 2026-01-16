"use client";

import { Button } from "@components/ui/button";
import { Table, TableBody, TableHeader } from "@components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { ArchiveRestore, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Evaluator, Office, SchoolDistrict } from "~/lib/types";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	type ScheduledClient,
	SchedulingTableHeader,
	SchedulingTableRow,
} from "./SchedulingTableBase";

const normalize = (val: string | null | undefined) => {
	if (!val || val === "-") return "";
	return val;
};

function useSchedulingFilters(
	clients: ScheduledClient[],
	evaluators: Evaluator[],
	offices: Office[],
	districts: SchoolDistrict[],
) {
	const [filters, setFilters] = useState<Record<string, string[]>>({});

	const uniqueValues = useMemo(() => {
		const values: Record<string, Set<string>> = {
			color: new Set(),
			fullName: new Set(),
			evaluator: new Set(),
			date: new Set(),
			time: new Set(),
			asdAdhd: new Set(),
			insurance: new Set(),
			code: new Set(),
			location: new Set(),
			district: new Set(),
			paDate: new Set(),
			age: new Set(),
			notes: new Set(),
		};

		for (const client of clients) {
			values.color?.add(normalize(client.color));
			values.fullName?.add(normalize(client.client.fullName));

			const evaluator = evaluators.find((e) => e.npi === client.evaluator);
			values.evaluator?.add(normalize(evaluator?.providerName.split(" ")[0]));

			values.date?.add(normalize(client.date));
			values.time?.add(normalize(client.time));
			values.asdAdhd?.add(normalize(client.client.asdAdhd));

			const insurance = [
				client.client.primaryInsurance,
				client.client.secondaryInsurance,
			]
				.filter(Boolean)
				.join(" | ");
			values.insurance?.add(normalize(insurance));

			values.code?.add(normalize(client.code));

			const office = offices.find((o) => o.key === client.office);
			const location =
				client.office === "Virtual"
					? "Virtual"
					: office?.prettyName || client.client.closestOffice || "";
			values.location?.add(normalize(location));

			const district = districts.find(
				(d) => d.fullName === client.client.schoolDistrict,
			);
			values.district?.add(
				normalize(
					district?.shortName ||
						client.client.schoolDistrict
							?.replace(/ County School District/, "")
							.replace(/ School District/, ""),
				),
			);

			const paDate = client.client.precertExpires
				? getLocalDayFromUTCDate(
						client.client.precertExpires,
					)?.toLocaleDateString() || ""
				: "";
			values.paDate?.add(normalize(paDate));

			const age = client.client.dob ? formatClientAge(client.client.dob) : "";
			values.age?.add(normalize(age));

			values.notes?.add(normalize(client.notes));
		}

		const result: Record<string, string[]> = {};
		for (const key in values) {
			result[key] = Array.from(values[key] || []).filter(
				(v) => v !== undefined,
			);
		}
		return result;
	}, [clients, evaluators, offices, districts]);

	const filteredClients = useMemo(() => {
		return clients.filter((client) => {
			return Object.entries(filters).every(([key, selectedValues]) => {
				if (!selectedValues || selectedValues.length === 0) return true;

				let value = "";
				switch (key) {
					case "color":
						value = normalize(client.color);
						break;
					case "fullName":
						value = normalize(client.client.fullName);
						break;
					case "evaluator": {
						const e = evaluators.find((ev) => ev.npi === client.evaluator);
						value = normalize(e?.providerName.split(" ")[0]);
						break;
					}
					case "date":
						value = normalize(client.date);
						break;
					case "time":
						value = normalize(client.time);
						break;
					case "asdAdhd":
						value = normalize(client.client.asdAdhd);
						break;
					case "insurance":
						value = normalize(
							[client.client.primaryInsurance, client.client.secondaryInsurance]
								.filter(Boolean)
								.join(" | "),
						);
						break;
					case "code":
						value = normalize(client.code);
						break;
					case "location": {
						const o = offices.find((of) => of.key === client.office);
						value = normalize(
							client.office === "Virtual"
								? "Virtual"
								: o?.prettyName || client.client.closestOffice || "",
						);
						break;
					}
					case "district": {
						const district = districts.find(
							(d) => d.fullName === client.client.schoolDistrict,
						);
						value = normalize(
							district?.shortName ||
								client.client.schoolDistrict
									?.replace(/ County School District/, "")
									.replace(/ School District/, ""),
						);
						break;
					}
					case "paDate":
						value = normalize(
							client.client.precertExpires
								? getLocalDayFromUTCDate(
										client.client.precertExpires,
									)?.toLocaleDateString() || ""
								: "",
						);
						break;
					case "age":
						value = normalize(
							client.client.dob ? formatClientAge(client.client.dob) : "",
						);
						break;
					case "notes":
						value = normalize(client.notes);
						break;
				}
				return selectedValues.includes(value);
			});
		});
	}, [clients, filters, evaluators, offices, districts]);

	const handleFilterChange = (column: string, selected: string[]) => {
		setFilters((prev) => ({
			...prev,
			[column]: selected,
		}));
	};

	return { filteredClients, filters, handleFilterChange, uniqueValues };
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

	const clients = (data?.clients || []) as ScheduledClient[];
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];
	const districts = (data?.schoolDistricts as SchoolDistrict[]) || [];

	const { filteredClients, filters, handleFilterChange, uniqueValues } =
		useSchedulingFilters(clients, evaluators, offices, districts);

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

	const handleUpdate = (clientId: number, updateData: any) => {
		updateMutation.mutate({ clientId, ...updateData });
	};

	const handleArchive = (clientId: number) => {
		archiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<SchedulingTableHeader
					filters={filters}
					onFilterChange={handleFilterChange}
					uniqueValues={uniqueValues}
				/>
			</TableHeader>
			<TableBody>
				{filteredClients.map((scheduledClient) => (
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
						districts={districts}
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

	const clients = (data?.clients || []) as ScheduledClient[];
	const evaluators = (data?.evaluators as Evaluator[]) || [];
	const offices = (data?.offices as Office[]) || [];
	const districts = (data?.schoolDistricts as SchoolDistrict[]) || [];

	const { filteredClients, filters, handleFilterChange, uniqueValues } =
		useSchedulingFilters(clients, evaluators, offices, districts);

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

	const handleUnarchive = (clientId: number) => {
		unarchiveMutation.mutate({ clientId });
	};

	return (
		<Table>
			<TableHeader>
				<SchedulingTableHeader
					filters={filters}
					onFilterChange={handleFilterChange}
					uniqueValues={uniqueValues}
				/>
			</TableHeader>
			<TableBody>
				{filteredClients.map((scheduledClient) => (
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
						districts={districts}
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
