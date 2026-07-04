"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { ArrowDownUp, Check, Filter, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import ClientCreateForm from "./ClientCreateForm";
import { ClientsList } from "./ClientsList";
import { NameSearchInput } from "./NameSearchInput";

export function ClientsDashboard() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const activeId = useId();
	const inactiveId = useId();
	const allId = useId();
	const hideBabyNetId = useId();
	const allTypesId = useId();
	const realTypeId = useId();
	const noteTypeId = useId();
	const privatePayId = useId();
	const autismStopId = useId();
	const sortPriorityId = useId();
	const sortFirstNameId = useId();
	const sortLastNameId = useId();
	const sortPaExpirationId = useId();

	const { data: session } = useSession();

	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [isInitialized, setIsInitialized] = useState(false);
	const [searchFocused, setSearchFocused] = useState(false);
	const lastSavedFiltersRef = useRef<string>("");

	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);
	const showRecentDropdown = searchFocused && !!recentClients?.length;

	// Fetch saved filters from the session
	const { data: savedFiltersData } = api.sessions.getClientFilters.useQuery(
		undefined,
		{
			enabled: !!session,
		},
	);

	// Mutation to save filters to the session
	const saveFiltersMutation = api.sessions.saveClientFilters.useMutation();

	const { data: allInsurances } = api.insurances.getAll.useQuery();

	const savedFilters = useMemo(() => {
		try {
			return savedFiltersData?.clientFilters
				? JSON.parse(savedFiltersData.clientFilters)
				: {};
		} catch {
			return {};
		}
	}, [savedFiltersData?.clientFilters]);

	// Initialize URL from saved filters on first load
	useEffect(() => {
		if (isInitialized || !session) return;

		const hasUrlParams = Array.from(searchParams.keys()).some(
			(key) => !["office", "evaluator"].includes(key),
		);

		// Only apply saved filters if there are no URL params
		if (!hasUrlParams && Object.keys(savedFilters).length > 0) {
			const params = new URLSearchParams(searchParams);

			Object.entries(savedFilters).forEach(([key, value]) => {
				if (
					value !== false &&
					value !== "active" &&
					value !== "both" &&
					value !== "priority"
				) {
					params.set(key, String(value));
				}
			});

			router.replace(`${pathname}?${params.toString()}`);
		}

		// Initialize the ref with current saved filters
		lastSavedFiltersRef.current = savedFiltersData?.clientFilters || "{}";
		setIsInitialized(true);
	}, [
		session,
		savedFilters,
		searchParams,
		pathname,
		router,
		isInitialized,
		savedFiltersData?.clientFilters,
	]);

	const queryParams = useMemo(() => {
		const office = searchParams.get("office") ?? undefined;
		const evaluator = searchParams.get("evaluator") ?? undefined;
		const hideBabyNet = searchParams.get("hideBabyNet") === "true";
		const status = searchParams.get("status") ?? undefined;
		const type = searchParams.get("type") ?? undefined;
		const color = (searchParams.get("color") as ClientColor) ?? undefined;
		const privatePay = searchParams.get("privatePay") === "true";
		const autismStop = searchParams.get("autismStop") === "true";
		const sort = searchParams.get("sort") ?? undefined;
		const insuranceParam = searchParams.get("insurance");
		const insuranceFilter = insuranceParam
			? insuranceParam.split(",").filter(Boolean)
			: undefined;

		const finalSearchTerm =
			debouncedSearchTerm.length >= 3 ? debouncedSearchTerm : undefined;

		return {
			nameSearch: finalSearchTerm,
			insuranceFilter: insuranceFilter?.length ? insuranceFilter : undefined,
			office,
			evaluatorNpi: evaluator ? parseInt(evaluator, 10) : undefined,
			hideBabyNet,
			status: status as "active" | "inactive" | "all" | undefined,
			type: type as "both" | "real" | "note" | undefined,
			color,
			privatePay,
			autismStop,
			sort: sort as
				| "priority"
				| "firstName"
				| "lastName"
				| "paExpiration"
				| undefined,
		};
	}, [searchParams, debouncedSearchTerm]);

	// Save filters to session whenever URL changes
	useEffect(() => {
		if (!isInitialized) return;

		const filtersToSave = {
			hideBabyNet: queryParams.hideBabyNet,
			status: queryParams.status,
			type: queryParams.type,
			color: queryParams.color,
			privatePay: queryParams.privatePay,
			autismStop: queryParams.autismStop,
			sort: queryParams.sort,
		};

		// Remove undefined/default values
		const cleanedFilters = Object.fromEntries(
			Object.entries(filtersToSave).filter(
				([_, value]) =>
					value !== undefined &&
					value !== false &&
					value !== "active" &&
					value !== "both" &&
					value !== "priority",
			),
		);

		const newFiltersString = JSON.stringify(cleanedFilters);

		// Only update if filters actually changed
		if (newFiltersString !== lastSavedFiltersRef.current) {
			lastSavedFiltersRef.current = newFiltersString;
			saveFiltersMutation.mutate({ clientFilters: newFiltersString });
		}
	}, [
		queryParams.hideBabyNet,
		queryParams.status,
		queryParams.type,
		queryParams.color,
		queryParams.privatePay,
		queryParams.autismStop,
		queryParams.sort,
		isInitialized,
		saveFiltersMutation,
	]);

	const {
		data: searchQuery,
		isLoading,
		isPlaceholderData,
	} = api.clients.search.useQuery(queryParams, {
		placeholderData: (previousData) => previousData,
	});

	const can = useCheckPermission();
	const canShell = can("clients:shell");

	const clients = searchQuery?.clients;
	const colorCounts = searchQuery?.colorCounts;

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!clients?.length) return;

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlightedIndex((prevIndex) => (prevIndex + 1) % clients.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlightedIndex(
					(prevIndex) => (prevIndex - 1 + clients.length) % clients.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (highlightedIndex !== -1 && clients?.[highlightedIndex]) {
					const client = clients[highlightedIndex];
					router.push(`/clients/${client.hash}`);
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [clients, highlightedIndex, router]);

	const handleUrlParamChange = (key: string, value: string | boolean) => {
		const params = new URLSearchParams(searchParams);
		if (
			value === false ||
			value === "active" ||
			value === "both" ||
			value === "priority"
		) {
			params.delete(key);
		} else {
			params.set(key, String(value));
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	const handleInsuranceToggle = (shortName: string) => {
		const params = new URLSearchParams(searchParams);
		const current = params.get("insurance")?.split(",").filter(Boolean) ?? [];
		const next = current.includes(shortName)
			? current.filter((n) => n !== shortName)
			: [...current, shortName];
		if (next.length === 0) {
			params.delete("insurance");
		} else {
			params.set("insurance", next.join(","));
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	const clientFormTrigger = (
		<Button size="icon" variant="outline">
			<Plus />
		</Button>
	);

	return (
		<div className="flex min-h-0 w-full flex-1 flex-col gap-3">
			<div className="flex flex-row gap-3">
				<NameSearchInput
					debounceMs={300}
					initialValue={""}
					onDebouncedChange={(name) => {
						setDebouncedSearchTerm(name);
						setHighlightedIndex(-1);
					}}
					onFocusChange={setSearchFocused}
				/>

				{canShell && (
					<ResponsiveDialog
						title="Create Note/Shell Client"
						trigger={clientFormTrigger}
					>
						<ClientCreateForm />
					</ResponsiveDialog>
				)}

				<Popover>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							variant={
								["sort"].some(
									(key) =>
										queryParams[key as keyof typeof queryParams] !== undefined,
								)
									? "default"
									: "outline"
							}
						>
							<ArrowDownUp />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end">
						<div className="space-y-4">
							<div className="space-y-2">
								<p className="font-medium text-sm">Sort By</p>
								<RadioGroup
									onValueChange={(value) => handleUrlParamChange("sort", value)}
									value={queryParams.sort ?? "priority"}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={sortPriorityId} value="priority" />
										<Label htmlFor={sortPriorityId}>Priority</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={sortLastNameId} value="lastName" />
										<Label htmlFor={sortLastNameId}>Last Name</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={sortFirstNameId} value="firstName" />
										<Label htmlFor={sortFirstNameId}>First Name</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem
											id={sortPaExpirationId}
											value="paExpiration"
										/>
										<Label htmlFor={sortPaExpirationId}>PA Expiration</Label>
									</div>
								</RadioGroup>
							</div>
						</div>
					</PopoverContent>
				</Popover>

				<Popover>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							variant={
								["hideBabynet", "status", "type", "privatepay", "color"].some(
									(key) =>
										queryParams[key as keyof typeof queryParams] !== false &&
										queryParams[key as keyof typeof queryParams] !==
											undefined &&
										queryParams[key as keyof typeof queryParams] !== "active" &&
										queryParams[key as keyof typeof queryParams] !== "both",
								) || (queryParams.insuranceFilter?.length ?? 0) > 0
									? "default"
									: "outline"
							}
						>
							<Filter />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="max-h-[80dvh] overflow-y-auto">
						<div className="space-y-4">
							<div className="space-y-2">
								<p className="font-medium text-sm">Client Status</p>
								<RadioGroup
									onValueChange={(value) =>
										handleUrlParamChange("status", value)
									}
									value={queryParams.status ?? "active"}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={activeId} value="active" />
										<Label htmlFor={activeId}>Active</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={inactiveId} value="inactive" />
										<Label htmlFor={inactiveId}>Inactive</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={allId} value="all" />
										<Label htmlFor={allId}>All</Label>
									</div>
								</RadioGroup>
							</div>
							<Separator />
							<div className="space-y-2">
								<p className="font-medium text-sm">Client Type</p>
								<RadioGroup
									onValueChange={(value) => handleUrlParamChange("type", value)}
									value={queryParams.type ?? "both"}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={allTypesId} value="both" />
										<Label htmlFor={allTypesId}>Both</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={realTypeId} value="real" />
										<Label htmlFor={realTypeId}>Real</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id={noteTypeId} value="note" />
										<Label htmlFor={noteTypeId}>Notes Only</Label>
									</div>
								</RadioGroup>
							</div>
							<Separator />
							<div className="space-y-2">
								<p className="font-medium text-sm">Color</p>
								<div className="grid grid-cols-6 gap-2 pt-1">
									{CLIENT_COLOR_KEYS.map((colorKey) => (
										<Tooltip key={colorKey}>
											<TooltipTrigger asChild>
												<button
													aria-label={`Filter by color: ${formatColorName(
														colorKey,
													)}`}
													className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm"
													key={colorKey}
													onClick={() => {
														const currentValue = queryParams.color;
														const newValue =
															currentValue === colorKey ? false : colorKey;
														handleUrlParamChange("color", newValue);
													}}
													style={{
														color:
															Number.parseInt(
																CLIENT_COLOR_MAP[colorKey].replace("#", ""),
																16,
															) >
															0xffffff / 2
																? "#333"
																: "#FFF",
														backgroundColor: CLIENT_COLOR_MAP[colorKey],
													}}
													type="button"
												>
													{queryParams.color === colorKey ? (
														<Check className="h-5 w-5" />
													) : (
														(
															colorCounts?.find((c) => c.color === colorKey)
																?.count ?? 0
														).toString()
													)}
												</button>
											</TooltipTrigger>
											<TooltipContent>
												<p>{formatColorName(colorKey)}</p>
											</TooltipContent>
										</Tooltip>
									))}
								</div>
							</div>
							<Separator />
							<div className="flex items-center space-x-2">
								<Checkbox
									checked={queryParams.hideBabyNet}
									id={hideBabyNetId}
									onCheckedChange={(checked) =>
										handleUrlParamChange("hideBabyNet", !!checked)
									}
								/>
								<Label className="font-medium text-sm" htmlFor={hideBabyNetId}>
									Hide BabyNet Clients
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<Checkbox
									checked={queryParams.privatePay}
									id={privatePayId}
									onCheckedChange={(checked) =>
										handleUrlParamChange("privatePay", !!checked)
									}
								/>
								<Label className="font-medium text-sm" htmlFor={privatePayId}>
									Private Pay Only
								</Label>
							</div>
							<div className="flex items-center space-x-2">
								<Checkbox
									checked={queryParams.autismStop}
									id={autismStopId}
									onCheckedChange={(checked) =>
										handleUrlParamChange("autismStop", !!checked)
									}
								/>
								<Label className="font-medium text-sm" htmlFor={autismStopId}>
									"Autism" in Records
								</Label>
							</div>
							{allInsurances && allInsurances.length > 0 && (
								<>
									<Separator />
									<div className="space-y-2">
										<p className="font-medium text-sm">Insurance</p>
										<div className="max-h-48 space-y-2 overflow-y-auto">
											{allInsurances.map((ins) => (
												<div
													className="flex items-center space-x-2"
													key={ins.id}
												>
													<Checkbox
														checked={
															queryParams.insuranceFilter?.includes(
																ins.shortName,
															) ?? false
														}
														id={`insurance-${ins.id}`}
														onCheckedChange={() =>
															handleInsuranceToggle(ins.shortName)
														}
													/>
													<Label
														className="font-medium text-sm"
														htmlFor={`insurance-${ins.id}`}
													>
														{ins.shortName}
													</Label>
												</div>
											))}
										</div>
									</div>
								</>
							)}
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{showRecentDropdown && (
				// biome-ignore lint/a11y/noStaticElementInteractions: preventDefault on mousedown stops the search input from blurring (and this dropdown from unmounting) before a click on a link inside it registers
				<div
					className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-background px-3 py-2 shadow-sm"
					onMouseDown={(e) => e.preventDefault()}
				>
					<span className="text-muted-foreground text-xs uppercase tracking-wide">
						Recent
					</span>
					{recentClients?.map((client) => (
						<Link
							className="shrink-0 whitespace-nowrap rounded-md border bg-muted px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground"
							href={`/clients/${client.hash}`}
							key={client.hash}
						>
							{client.name}
						</Link>
					))}
				</div>
			)}

			{/* biome-ignore lint/a11y/noStaticElementInteractions: preventDefault on mousedown stops the search input from blurring (and the recent-clients dropdown above from unmounting mid-click) before a click on a result registers */}
			<div
				className={`min-h-0 flex-1 ${isPlaceholderData ? "opacity-60 transition-opacity duration-200" : "opacity-100 transition-opacity duration-200"}`}
				onMouseDown={(e) => e.preventDefault()}
			>
				{isLoading ? (
					<Skeleton className="h-full w-full" />
				) : (
					<ClientsList
						clients={clients ?? []}
						heightClass="h-full"
						highlightedIndex={highlightedIndex}
						savedPlace={queryParams.color}
					/>
				)}
			</div>
		</div>
	);
}
