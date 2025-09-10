"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@ui/dialog";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { CheckIcon, Filter, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { api } from "~/trpc/react";
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
	const privatePayId = useId();

	const [debouncedNameForQuery, setDebouncedNameForQuery] = useState("");

	const [highlightedIndex, setHighlightedIndex] = useState(-1);

	const filters = useMemo(() => {
		const office = searchParams.get("office") ?? undefined;
		const evaluator = searchParams.get("evaluator") ?? undefined;
		const hideBabyNet = searchParams.get("hideBabyNet") === "true";
		const status = searchParams.get("status") ?? undefined;
		const color = (searchParams.get("color") as ClientColor) ?? undefined;
		const privatePay = searchParams.get("privatePay") === "true";

		// TODO: Provide user feedback that the name search is too short
		const finalNameSearch =
			debouncedNameForQuery.length >= 3 ? debouncedNameForQuery : undefined;

		return {
			nameSearch: finalNameSearch,
			office,
			evaluatorNpi: evaluator ? parseInt(evaluator, 10) : undefined,
			hideBabyNet,
			status: status as "active" | "inactive" | "all" | undefined,
			color,
			privatePay,
		};
	}, [searchParams, debouncedNameForQuery]);

	const {
		data: searchQuery,
		isLoading,
		isPlaceholderData,
	} = api.clients.search.useQuery(filters, {
		// The `placeholderData` option keeps the old data on screen while new data is fetched.
		placeholderData: (previousData) => previousData,
	});

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
		setDebouncedNameForQuery("");
		setHighlightedIndex(-1);
	}, []);

	const handleUrlParamChange = (key: string, value: string | boolean) => {
		const params = new URLSearchParams(searchParams);
		if (value === false || value === "active") {
			params.delete(key);
		} else {
			params.set(key, String(value));
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<div className="flex w-full flex-col items-start justify-center gap-4 lg:flex-row lg:gap-8">
			<div className="flex w-full flex-col gap-3 lg:w-1/3">
				<div className="flex flex-row gap-3">
					<NameSearchInput
						debounceMs={300}
						initialValue={""}
						onDebouncedChange={(name) => {
							setDebouncedNameForQuery(name);
							setHighlightedIndex(-1);
						}}
					/>

					<Dialog>
						<DialogTrigger asChild>
							<Button size="icon" variant="outline">
								<Plus />
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogTitle>Create Note/Shell Client</DialogTitle>
							<ClientCreateForm />
						</DialogContent>
					</Dialog>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								className={
									["hideBabynet", "status", "privatepay", "color"].some(
										(key) =>
											filters[key as keyof typeof filters] !== false &&
											filters[key as keyof typeof filters] !== undefined &&
											filters[key as keyof typeof filters] !== "active",
									)
										? "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground"
										: ""
								}
								size="icon"
								variant="outline"
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
										value={filters.status ?? "active"}
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
															const currentValue = filters.color;
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
														{filters.color === colorKey ? (
															<CheckIcon className="h-5 w-5" />
														) : (
															(colorCounts?.find((c) => c.color === colorKey)
																?.count ?? 0)
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
										checked={filters.hideBabyNet}
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
										checked={filters.privatePay}
										id={privatePayId}
										onCheckedChange={(checked) =>
											handleUrlParamChange("privatePay", !!checked)
										}
									/>
									<Label className="font-medium text-sm" htmlFor={privatePayId}>
										Private Pay Only
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
						/>
					)}
				</div>
			</div>

			<ClientsSearchForm onResetFilters={handleReset} />
		</div>
	);
}
