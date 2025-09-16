"use client";

import { Input } from "@ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { debounce } from "lodash";
import { Search } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

interface NameSearchInputProps {
	initialValue: string;
	onDebouncedChange: (value: string) => void;
	debounceMs?: number;
}

export function NameSearchInput({
	initialValue,
	onDebouncedChange,
	debounceMs = 500,
}: NameSearchInputProps) {
	const [inputValue, setInputValue] = useState(initialValue);
	const [isFocused, setIsFocused] = useState(true);
	const inputId = useId();

	// biome-ignore lint/correctness/useExhaustiveDependencies: actually need parent stuff that will change
	const debouncedUpdate = useCallback(
		debounce((value: string) => {
			onDebouncedChange(value);
		}, debounceMs),
		[onDebouncedChange, debounceMs],
	);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setInputValue(value);
		debouncedUpdate(value);
	};

	const handleFocusBlur = (isFocused: boolean) => {
		setIsFocused(isFocused);
	};

	useEffect(() => {
		setInputValue(initialValue);
	}, [initialValue]);

	const showTooltip =
		inputValue.length > 0 && inputValue.length < 3 && !isFocused;

	return (
		<Tooltip open={showTooltip}>
			<TooltipTrigger asChild>
				<div className="relative w-full">
					<Input
						aria-invalid={
							inputValue.length > 0 && inputValue.length < 3 && !isFocused
						}
						aria-label="Search by name or ID"
						autoFocus={isFocused}
						className="pl-10 text-sm"
						id={inputId}
						onBlur={() => handleFocusBlur(false)}
						onChange={handleChange}
						onFocus={() => handleFocusBlur(true)}
						placeholder="Search by name or ID..."
						value={inputValue}
					/>
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] text-muted-foreground" />
				</div>
			</TooltipTrigger>
			<TooltipContent
				arrowClassName="bg-destructive fill-destructive"
				className="bg-destructive text-destructive-foreground"
			>
				Enter at least 3 characters
			</TooltipContent>
		</Tooltip>
	);
}
