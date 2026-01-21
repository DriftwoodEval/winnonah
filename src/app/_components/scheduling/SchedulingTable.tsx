"use client";

import { Button } from "@components/ui/button";
import { Table, TableBody, TableHeader } from "@components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { Skeleton } from "@ui/skeleton";
import { ArchiveRestore, Loader2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScheduledClient } from "~/lib/api-types";
import type {
	Evaluator,
	InsuranceWithAliases,
	Office,
	SchoolDistrict,
} from "~/lib/models";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	getScheduledClientDisplayValues,
	RowCountDisplay,
	SchedulingTableHeader,
	SchedulingTableRow,
	type SchedulingUpdateData,
} from "./SchedulingTableBase";

function useTableScroll() {
	const [isScrolledLeft, setIsScrolledLeft] = useState(false);
	const [isScrolledTop, setIsScrolledTop] = useState(false);
	const tableRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const table = tableRef.current;
		if (!table) return;

		const handleScroll = () => {
			setIsScrolledLeft(table.scrollLeft > 0);
			setIsScrolledTop(table.scrollTop > 0);
		};

		handleScroll();

		table.addEventListener("scroll", handleScroll);
		return () => table.removeEventListener("scroll", handleScroll);
	}, []);

	return { isScrolledLeft, isScrolledTop, tableRef };
}

function useSchedulingFilters(
	clients: ScheduledClient[],
	evaluators: Evaluator[],
	offices: Office[],
	districts: SchoolDistrict[],
	insurances: InsuranceWithAliases[],
) {
	const [filters, setFilters] = useState<Record<string, string[]>>({});
	const [isInitialized, setIsInitialized] = useState(false);
	const lastSavedFiltersRef = useRef<string>("");
	const { data: session } = useSession();

	const { data: savedFiltersData, isSuccess: isFetchSuccess } =
		api.sessions.getSchedulingFilters.useQuery(undefined, {
			enabled: !!session,
		});

	const saveFiltersMutation = api.sessions.saveSchedulingFilters.useMutation();

	useEffect(() => {
		if (isInitialized || !isFetchSuccess || !session) return;

		if (savedFiltersData?.schedulingFilters) {
			try {
				const saved = JSON.parse(savedFiltersData.schedulingFilters);
				setFilters(saved);
				lastSavedFiltersRef.current = savedFiltersData.schedulingFilters;
			} catch (e) {
				console.error("Failed to parse saved scheduling filters", e);
			}
		} else {
			lastSavedFiltersRef.current = "{}";
		}
		setIsInitialized(true);
	}, [savedFiltersData, isInitialized, isFetchSuccess, session]);

	useEffect(() => {
		if (!isInitialized || !session) return;

		const filtersString = JSON.stringify(filters);
		if (filtersString !== lastSavedFiltersRef.current) {
			lastSavedFiltersRef.current = filtersString;
			saveFiltersMutation.mutate({ schedulingFilters: filtersString });
		}
	}, [filters, session, saveFiltersMutation, isInitialized]);

	const evaluatorMap = useMemo(
		() => new Map(evaluators.map((e) => [e.npi, e])),
		[evaluators],
	);
	const officeMap = useMemo(
		() => new Map(offices.map((o) => [o.key, o])),
		[offices],
	);
	const districtMap = useMemo(
		() => new Map(districts.map((d) => [d.fullName, d])),
		[districts],
	);

	const clientDisplayValues = useMemo(() => {
		return clients.map((client) => ({
			client,
			displayValues: getScheduledClientDisplayValues(
				client,
				evaluatorMap,
				officeMap,
				districtMap,
				insurances,
			),
		}));
	}, [clients, evaluatorMap, officeMap, districtMap, insurances]);

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

		for (const { displayValues } of clientDisplayValues) {
			for (const key in values) {
				const val = displayValues[key as keyof typeof displayValues];
				if (val !== undefined) {
					values[key]?.add(val);
				}
			}
		}

		const result: Record<string, string[]> = {};
		for (const key in values) {
			result[key] = Array.from(values[key] || [])
				.filter((v) => v !== undefined)
				.sort();
		}
		return result;
	}, [clientDisplayValues]);

	const filteredClients = useMemo(() => {
		return clientDisplayValues
			.filter(({ displayValues }) => {
				return Object.entries(filters).every(([key, selectedValues]) => {
					if (!selectedValues || selectedValues.length === 0) return true;
					const value = displayValues[key as keyof typeof displayValues];
					return selectedValues.includes(value || "");
				});
			})
			.map(({ client }) => client);
	}, [clientDisplayValues, filters]);

	const handleFilterChange = (column: string, selected: string[]) => {
		setFilters((prev) => {
			const newFilters = { ...prev };
			if (selected.length === 0) {
				delete newFilters[column];
			} else {
				newFilters[column] = selected;
			}
			return newFilters;
		});
	};

	return { filteredClients, filters, handleFilterChange, uniqueValues };
}

interface InternalSchedulingTableProps {
	clients: ScheduledClient[];
	evaluators: Evaluator[];
	offices: Office[];
	districts: SchoolDistrict[];
	insurances: InsuranceWithAliases[];
	isEditable: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	onAction: (clientId: number) => void;
	actionIcon: React.ReactNode;
	actionVariant: "default" | "destructive";
	isActionPending: boolean;
}

function InternalSchedulingTable({
	clients,
	evaluators,
	offices,
	districts,
	insurances,
	isEditable,
	onUpdate,
	onAction,
	actionIcon,
	actionVariant,
	isActionPending,
}: InternalSchedulingTableProps) {
	const { isScrolledLeft, isScrolledTop, tableRef } = useTableScroll();
	const { filteredClients, filters, handleFilterChange, uniqueValues } =
		useSchedulingFilters(clients, evaluators, offices, districts, insurances);

	const evaluatorMap = useMemo(
		() => new Map(evaluators.map((e) => [e.npi, e])),
		[evaluators],
	);
	const officeMap = useMemo(
		() => new Map(offices.map((o) => [o.key, o])),
		[offices],
	);
	const districtMap = useMemo(
		() => new Map(districts.map((d) => [d.fullName, d])),
		[districts],
	);

	const clientDisplayValues = useMemo(() => {
		return clients.map((client) => ({
			client,
			displayValues: getScheduledClientDisplayValues(
				client,
				evaluatorMap,
				officeMap,
				districtMap,
				insurances,
			),
		}));
	}, [clients, evaluatorMap, officeMap, districtMap, insurances]);

	return (
		<>
			<RowCountDisplay
				filteredCount={filteredClients.length}
				totalCount={clients.length}
			/>
			<Table
				className="min-w-max"
				classNameWrapper={cn(
					"min-h-0 flex-1",
					isScrolledLeft && "scrolled-left",
					isScrolledTop && "scrolled-top",
				)}
				ref={tableRef}
			>
				<TableHeader className="sticky top-0 z-20 bg-background">
					<SchedulingTableHeader
						clientDisplayValues={clientDisplayValues}
						filters={filters}
						isScrolledLeft={isScrolledLeft}
						isScrolledTop={isScrolledTop}
						onFilterChange={handleFilterChange}
						uniqueValues={uniqueValues}
					/>
				</TableHeader>

				<TableBody>
					{filteredClients.map((scheduledClient) => (
						<SchedulingTableRow
							actions={
								<Button
									disabled={isActionPending}
									onClick={() => onAction(scheduledClient.clientId)}
									size="sm"
									variant={actionVariant}
								>
									{isActionPending ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										actionIcon
									)}
								</Button>
							}
							districts={districts}
							evaluators={evaluators}
							insurances={insurances}
							isEditable={isEditable}
							isScrolledLeft={isScrolledLeft}
							key={scheduledClient.clientId}
							offices={offices}
							onUpdate={onUpdate}
							scheduledClient={scheduledClient}
						/>
					))}
				</TableBody>
			</Table>
		</>
	);
}

function ActiveSchedulingTable() {
	const utils = api.useUtils();

	const { data, isLoading, error } = api.scheduling.get.useQuery();

	const updateMutation = api.scheduling.update.useMutation({
		onMutate: async (newUpdate) => {
			await utils.scheduling.get.cancel();

			const previousData = utils.scheduling.get.getData();

			utils.scheduling.get.setData(undefined, (old) => {
				if (!old) return old;

				return {
					...old,

					clients: old.clients.map((c) =>
						c.clientId === newUpdate.clientId
							? {
									...c,

									evaluator:
										newUpdate.evaluatorNpi !== undefined
											? newUpdate.evaluatorNpi
											: (c.evaluator as number | null),

									date:
										newUpdate.date !== undefined
											? newUpdate.date
											: (c.date as string | null),

									time:
										newUpdate.time !== undefined
											? newUpdate.time
											: (c.time as string | null),

									office:
										newUpdate.office !== undefined
											? newUpdate.office
											: c.office || "",

									notes:
										newUpdate.notes !== undefined
											? newUpdate.notes
											: (c.notes as string | null),

									code:
										newUpdate.code !== undefined
											? newUpdate.code
											: (c.code as string | null),

									color:
										newUpdate.color !== undefined
											? newUpdate.color
											: (c.color as string | null),
								}
							: c,
					),
				};
			});

			return { previousData };
		},

		onError: (_err, _newUpdate, context) => {
			if (context?.previousData) {
				utils.scheduling.get.setData(undefined, context.previousData);
			}
		},

		onSettled: () => {
			utils.scheduling.get.invalidate();
		},
	});

	const archiveMutation = api.scheduling.archive.useMutation({
		onSuccess: () => {
			utils.scheduling.get.invalidate();

			utils.scheduling.getArchived.invalidate();
		},
	});

	if (isLoading) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{["sk1", "sk2", "sk3", "sk4", "sk5"].map((id) => (
					<Skeleton className="h-10 w-full" key={id} />
				))}
			</div>
		);
	}

	if (error) return <div>Error: {error.message}</div>;

	return (
		<InternalSchedulingTable
			actionIcon={<X />}
			actionVariant="destructive"
			clients={(data?.clients || []) as ScheduledClient[]}
			districts={(data?.schoolDistricts as SchoolDistrict[]) || []}
			evaluators={(data?.evaluators as Evaluator[]) || []}
			insurances={(data?.insurances as InsuranceWithAliases[]) || []}
			isActionPending={archiveMutation.isPending}
			isEditable={true}
			offices={(data?.offices as Office[]) || []}
			onAction={(clientId) => archiveMutation.mutate({ clientId })}
			onUpdate={(clientId, updateData) =>
				updateMutation.mutate({ clientId, ...updateData })
			}
		/>
	);
}

function ArchivedSchedulingTable() {
	const utils = api.useUtils();

	const { data, isLoading, error } = api.scheduling.getArchived.useQuery();

	const unarchiveMutation = api.scheduling.unarchive.useMutation({
		onSuccess: () => {
			utils.scheduling.getArchived.invalidate();

			utils.scheduling.get.invalidate();
		},
	});

	if (isLoading)
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{["sk1", "sk2", "sk3", "sk4", "sk5"].map((id) => (
					<Skeleton className="h-10 w-full" key={id} />
				))}
			</div>
		);
	if (error) return <div>Error: {error.message}</div>;

	return (
		<InternalSchedulingTable
			actionIcon={<ArchiveRestore />}
			actionVariant="default"
			clients={(data?.clients || []) as ScheduledClient[]}
			districts={(data?.schoolDistricts as SchoolDistrict[]) || []}
			evaluators={(data?.evaluators as Evaluator[]) || []}
			insurances={(data?.insurances as InsuranceWithAliases[]) || []}
			isActionPending={unarchiveMutation.isPending}
			isEditable={false}
			offices={(data?.offices as Office[]) || []}
			onAction={(clientId) => unarchiveMutation.mutate({ clientId })}
		/>
	);
}

export function SchedulingTable() {
	return (
		<Tabs className="flex h-full flex-col" defaultValue="active">
			<TabsList className="shrink-0">
				<TabsTrigger value="active">Active</TabsTrigger>
				<TabsTrigger value="archived">Archived</TabsTrigger>
			</TabsList>
			<TabsContent
				className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				value="active"
			>
				<ActiveSchedulingTable />
			</TabsContent>
			<TabsContent
				className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				value="archived"
			>
				<ArchivedSchedulingTable />
			</TabsContent>
		</Tabs>
	);
}
