"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { debounce } from "lodash";
import { CheckIcon, Filter } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { api } from "~/trpc/react";
import { ClientsList } from "./ClientsList";
import ClientsSearchForm from "./ClientsSearchForm";

export function ClientsDashboard() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [nameSearchInput, setNameSearchInput] = useState("");
	const [debouncedNameForQuery, setDebouncedNameForQuery] = useState("");

	const filters = useMemo(() => {
		const office = searchParams.get("office") ?? undefined;
		const evaluator = searchParams.get("evaluator") ?? undefined;
		const hideBabyNet = searchParams.get("hideBabyNet") === "true";
		const status = searchParams.get("status") ?? undefined;
		const color = (searchParams.get("color") as ClientColor) ?? undefined;

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
		};
	}, [searchParams, debouncedNameForQuery]);

	const {
		data: clients,
		isLoading,
		isPlaceholderData,
	} = api.clients.search.useQuery(filters, {
		// The `placeholderData` option keeps the old data on screen while new data is fetched.
		placeholderData: (previousData) => previousData,
	});

	const debouncedQueryUpdate = useCallback(
		debounce((value: string) => {
			setDebouncedNameForQuery(value);
		}, 500),
		[],
	);

	const handleNameSearchChange = (value: string) => {
		setNameSearchInput(value);
		debouncedQueryUpdate(value);
	};

	const handleReset = useCallback(() => {
		setNameSearchInput("");
		setDebouncedNameForQuery("");
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
		<div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
			<div className="flex flex-col gap-3">
				<div className="flex flex-row gap-3">
					<Input
						autoFocus
						id="name-search"
						onChange={(e) => handleNameSearchChange(e.target.value)}
						placeholder="Search by name..."
						value={nameSearchInput}
					/>

					<Popover>
						<PopoverTrigger asChild>
							<Button variant="outline">
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
											<RadioGroupItem id="s-active" value="active" />
											<Label htmlFor="s-active">Active</Label>
										</div>
										<div className="flex items-center space-x-2">
											<RadioGroupItem id="s-inactive" value="inactive" />
											<Label htmlFor="s-inactive">Inactive</Label>
										</div>
										<div className="flex items-center space-x-2">
											<RadioGroupItem id="s-all" value="all" />
											<Label htmlFor="s-all">All</Label>
										</div>
									</RadioGroup>
								</div>
								<Separator />
								<div className="space-y-2">
									<p className="font-medium text-sm">Color</p>
									<div className="grid grid-cols-6 gap-2 pt-1">
										{CLIENT_COLOR_KEYS.map((colorKey) => (
											<button
												aria-label={`Filter by color: ${formatColorName(
													colorKey,
												)}`}
												className="relative flex h-8 w-8 items-center justify-center rounded-full"
												key={colorKey}
												onClick={() => {
													const currentValue = filters.color;
													const newValue =
														currentValue === colorKey ? false : colorKey;
													handleUrlParamChange("color", newValue);
												}}
												style={{
													backgroundColor: CLIENT_COLOR_MAP[colorKey],
												}}
												type="button"
											>
												{filters.color === colorKey && (
													<CheckIcon
														className="h-5 w-5"
														style={{
															color:
																Number.parseInt(
																	CLIENT_COLOR_MAP[colorKey].replace("#", ""),
																	16,
																) >
																0xffffff / 2
																	? "#333"
																	: "#FFF",
														}}
													/>
												)}
											</button>
										))}
									</div>
								</div>
								<Separator />
								<div className="flex items-center space-x-2">
									<Checkbox
										checked={filters.hideBabyNet}
										id="hide-babynet"
										onCheckedChange={(checked) =>
											handleUrlParamChange("hideBabyNet", !!checked)
										}
									/>
									<Label className="font-medium text-sm" htmlFor="hide-babynet">
										Hide BabyNet Clients
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
						<ClientsList clients={clients ?? []} />
					)}
				</div>
			</div>

			<ClientsSearchForm onResetFilters={handleReset} />
		</div>
	);
}
