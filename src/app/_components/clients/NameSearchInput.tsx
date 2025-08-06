"use client";

import { Input } from "@ui/input";
import { debounce } from "lodash";
import { useCallback, useEffect, useState } from "react";

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

	useEffect(() => {
		setInputValue(initialValue);
	}, [initialValue]);

	return (
		<Input
			autoFocus
			id="name-search"
			onChange={handleChange}
			placeholder="Search by name..."
			value={inputValue}
		/>
	);
}
