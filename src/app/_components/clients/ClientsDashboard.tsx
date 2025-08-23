"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { CheckIcon, Filter } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { api } from "~/trpc/react";
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

	const handleReset = useCallback(() => {
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
		<div className="flex w-full flex-col items-start justify-center gap-4 lg:flex-row lg:gap-8">
			<div className="flex w-full flex-col gap-3 lg:w-1/3">
				<div className="flex flex-row gap-3">
					<NameSearchInput
						debounceMs={300}
						initialValue={""}
						onDebouncedChange={setDebouncedNameForQuery}
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
												{colorCounts?.find((c) => c.color === colorKey)
													?.count ?? 0}
												{filters.color === colorKey && (
													<CheckIcon className="h-5 w-5" />
												)}
											</button>
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
						<ClientsList clients={clients ?? []} />
					)}
				</div>
			</div>

			<ClientsSearchForm onResetFilters={handleReset} />
		</div>
	);
}
