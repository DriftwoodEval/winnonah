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
import { Filter } from "lucide-react";
import { useMemo, useState } from "react";

export interface FilterOption {
	value: string;
	label: string;
	swatch?: string;
}

export function toFilterOptions(values: readonly string[]): FilterOption[] {
	return values.map((v) => ({ value: v, label: v }));
}

interface ColumnFilterProps {
	columnName: string;
	options: FilterOption[];
	selectedValues: string[];
	onFilterChange: (values: string[]) => void;
	counts?: Record<string, number>;
}

export function ColumnFilter({
	columnName,
	options,
	selectedValues,
	onFilterChange,
	counts,
}: ColumnFilterProps) {
	const [search, setSearch] = useState("");

	const filteredOptions = useMemo(() => {
		return options
			.filter((option) =>
				option.label.toLowerCase().includes(search.toLowerCase()),
			)
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [options, search]);

	const toggleValue = (value: string) => {
		const newValues = selectedValues.includes(value)
			? selectedValues.filter((v) => v !== value)
			: [...selectedValues, value];
		onFilterChange(newValues);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<div className="relative inline-block">
					<Button
						aria-label={`Filter by ${columnName}`}
						className={
							selectedValues.length > 0
								? "text-primary"
								: "text-muted-foreground"
						}
						size="icon-sm"
						variant="ghost"
					>
						<Filter className="h-3.5 w-3.5" />
					</Button>
					{selectedValues.length > 0 && (
						<span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground leading-none">
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
					<div className="max-h-60 overflow-y-auto">
						{filteredOptions.length === 0 && (
							<div className="p-2 text-muted-foreground text-sm">
								No results found
							</div>
						)}
						{filteredOptions.map((option) => {
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
										className="flex flex-1 cursor-pointer items-center justify-between gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
										htmlFor={`${columnName}-${option.value}`}
									>
										<span className="flex min-w-0 items-center gap-1 truncate">
											{option.swatch && (
												<span
													className="h-2 w-2 shrink-0 rounded-full"
													style={{ backgroundColor: option.swatch }}
												/>
											)}
											<span className="truncate">{option.label}</span>
										</span>
										{counts && (
											<span className="text-muted-foreground text-xs">
												{count ?? 0}
											</span>
										)}
									</label>
								</div>
							);
						})}
					</div>
				</div>
				{selectedValues.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="justify-center text-destructive"
							onClick={() => onFilterChange([])}
						>
							Clear Filter
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
