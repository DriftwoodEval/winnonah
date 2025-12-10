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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { cn, hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import ClientCreateForm from "./ClientCreateForm";
import { ClientsList } from "./ClientsList";
import ClientsSearchForm from "./ClientsSearchForm";
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
	const lastSavedFiltersRef = useRef<string>("");

	// Fetch saved filters from the session
	const { data: savedFiltersData } = api.sessions.getClientFilters.useQuery(
		undefined,
		{
			enabled: !!session,
		},
	);

	// Mutation to save filters to the session
	const saveFiltersMutation = api.sessions.saveClientFilters.useMutation();

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

		const finalSearchTerm =
			debouncedSearchTerm.length >= 3 ? debouncedSearchTerm : undefined;

		return {
			nameSearch: finalSearchTerm,
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

	const canShell = session
		? hasPermission(session.user.permissions, "clients:shell")
		: false;

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

	const handleReset = useCallback(() => {
		setDebouncedSearchTerm("");
		setHighlightedIndex(-1);
	}, []);

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

	const clientFormTrigger = (
		<Button size="icon" variant="outline">
			<Plus />
		</Button>
	);

	return (
		<div className="flex w-full flex-col items-start justify-center gap-4 lg:flex-row lg:gap-8">
			<div className="flex w-full flex-col gap-3 lg:w-1/3">
				<div className="flex flex-row gap-3">
					<NameSearchInput
						debounceMs={300}
						initialValue={""}
						onDebouncedChange={(name) => {
							setDebouncedSearchTerm(name);
							setHighlightedIndex(-1);
						}}
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
								className={cn(
									"text-foreground",
									["sort"].some(
										(key) =>
											queryParams[key as keyof typeof queryParams] !==
											undefined,
									)
										? "bg-secondary hover:bg-secondary/80"
										: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
								)}
								size="icon"
							>
								<ArrowDownUp />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end">
							<div className="space-y-4">
								<div className="space-y-2">
									<p className="font-medium text-sm">Sort By</p>
									<RadioGroup
										onValueChange={(value) =>
											handleUrlParamChange("sort", value)
										}
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
								className={cn(
									"text-foreground",
									["hideBabynet", "status", "type", "privatepay", "color"].some(
										(key) =>
											queryParams[key as keyof typeof queryParams] !== false &&
											queryParams[key as keyof typeof queryParams] !==
												undefined &&
											queryParams[key as keyof typeof queryParams] !==
												"active" &&
											queryParams[key as keyof typeof queryParams] !== "both",
									)
										? "bg-secondary hover:bg-secondary/80"
										: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
								)}
								size="icon"
							>
								<Filter />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end">
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
										onValueChange={(value) =>
											handleUrlParamChange("type", value)
										}
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
												<TooltipContent
													arrowClassName="bg-background fill-background"
													className="bg-background text-foreground"
												>
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
									<Label
										className="font-medium text-sm"
										htmlFor={hideBabyNetId}
									>
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
							</div>
						</PopoverContent>
					</Popover>
				</div>

				<div
					className={
						isPlaceholderData
							? "opacity-60 transition-opacity duration-200"
							: "opacity-100 transition-opacity duration-200"
					}
				>
					{isLoading ? (
						<Skeleton className="h-[400px] w-full" />
					) : (
						<ClientsList
							clients={clients ?? []}
							highlightedIndex={highlightedIndex}
							savedPlace={queryParams.color}
						/>
					)}
				</div>
			</div>

			{/* <ClientsSearchForm onResetFilters={handleReset} /> */}
		</div>
	);
}
