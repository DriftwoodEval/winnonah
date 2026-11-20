"use client";

import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Input } from "@ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Check, Filter } from "lucide-react";
import { useMemo, useState } from "react";

export interface FilterOption {
	value: string;
	label: string;
	swatch?: string;
}

// Mirrors NONE_FILTER_VALUE in src/server/api/filters.ts: the sentinel a facet
// count uses for rows whose underlying field is null/unset. Shown as "None".
export const NONE_FILTER_VALUE = "__none__";

export function toFilterOptions(values: readonly string[]): FilterOption[] {
	return values.map((v) => ({
		value: v,
		label: v === NONE_FILTER_VALUE ? "None" : v,
	}));
}

// "None" (the sentinel for "field is unset") reads better pinned to the top
// of the list than wherever it happens to alphabetize to.
function compareOptions(a: FilterOption, b: FilterOption) {
	if (a.label === "None") return -1;
	if (b.label === "None") return 1;
	return a.label.localeCompare(b.label);
}

// Mirrors the color-swatch contrast logic in ClientsDashboard's color picker.
function contrastColor(hex: string) {
	return Number.parseInt(hex.replace("#", ""), 16) > 0xffffff / 2
		? "#333"
		: "#FFF";
}

interface ColumnFilterProps {
	columnName: string;
	options: FilterOption[];
	selectedValues: string[];
	/** Selection the view starts with; only a selection that differs from it is shown as an active filter. */
	defaultValues?: string[];
	onFilterChange: (values: string[]) => void;
	counts?: Record<string, number>;
	/** Show options in the order given instead of alphabetically (for ranges). */
	keepOrder?: boolean;
}

export function ColumnFilter({
	columnName,
	options,
	selectedValues,
	defaultValues = [],
	onFilterChange,
	counts,
	keepOrder = false,
}: ColumnFilterProps) {
	const [search, setSearch] = useState("");

	const filteredOptions = useMemo(() => {
		return options
			.filter((option) =>
				option.label.toLowerCase().includes(search.toLowerCase()),
			)
			.sort((a, b) => (keepOrder ? 0 : compareOptions(a, b)));
	}, [options, search, keepOrder]);

	// Swatch options (colors) render as a grid of circles instead of
	// checkbox rows, matching the color picker on the client search page.
	const swatchOptions = filteredOptions.filter((option) => option.swatch);
	const listOptions = filteredOptions.filter((option) => !option.swatch);

	const isModified =
		selectedValues.length !== defaultValues.length ||
		!defaultValues.every((v) => selectedValues.includes(v));

	const toggleValue = (value: string) => {
		const newValues = selectedValues.includes(value)
			? selectedValues.filter((v) => v !== value)
			: [...selectedValues, value];
		onFilterChange(newValues);
	};

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<div className="relative inline-block pt-1 pr-1">
					<Button
						aria-label={`Filter by ${columnName}`}
						className={isModified ? "text-primary" : "text-muted-foreground"}
						size="icon-sm"
						variant="ghost"
					>
						<Filter className="h-3.5 w-3.5" />
					</Button>
					{isModified && (
						<span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground">
							{selectedValues.length}
						</span>
					)}
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="p-2">
					<Input
						className="mb-2 h-8"
						onChange={(e) => setSearch(e.target.value)}
						placeholder={`Search ${columnName}...`}
						value={search}
					/>
					{filteredOptions.length === 0 && (
						<div className="p-2 text-sm text-muted-foreground">
							No results found
						</div>
					)}
					{swatchOptions.length > 0 && (
						<div className="grid grid-cols-6 gap-2 pb-2">
							{swatchOptions.map((option) => {
								const selected = selectedValues.includes(option.value);
								const count = counts?.[option.value];
								return (
									<Tooltip key={option.value}>
										<TooltipTrigger asChild>
											<button
												aria-label={`Filter by ${option.label}`}
												className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm"
												onClick={() => toggleValue(option.value)}
												style={{
													backgroundColor: option.swatch,
													color: contrastColor(option.swatch ?? "#FFFFFF"),
												}}
												type="button"
											>
												{selected ? (
													<Check className="h-4 w-4" />
												) : (
													(count ?? 0)
												)}
											</button>
										</TooltipTrigger>
										<TooltipContent>
											<p>{option.label}</p>
										</TooltipContent>
									</Tooltip>
								);
							})}
						</div>
					)}
					{listOptions.map((option) => {
						const count = counts?.[option.value];
						return (
							<div
								className="flex items-center space-x-2 p-1"
								key={option.value}
							>
								<Checkbox
									checked={selectedValues.includes(option.value)}
									id={`${columnName}-${option.value}`}
									onCheckedChange={() => toggleValue(option.value)}
								/>
								<label
									className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									htmlFor={`${columnName}-${option.value}`}
								>
									<span className="truncate">{option.label}</span>
									{counts && (
										<span className="text-xs text-muted-foreground">
											{count ?? 0}
										</span>
									)}
								</label>
							</div>
						);
					})}
				</div>
				{isModified && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="justify-center text-destructive"
							onClick={() => onFilterChange(defaultValues)}
						>
							Clear Filter
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
