"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { debounce } from "lodash";
import { Search } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "../ui/input-group";

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
				<InputGroup>
					<InputGroupInput
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
					<InputGroupAddon>
						<Search />
					</InputGroupAddon>
				</InputGroup>
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
