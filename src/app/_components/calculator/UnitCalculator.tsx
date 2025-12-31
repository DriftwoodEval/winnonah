"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { Checkbox } from "@ui/checkbox";
import { Skeleton } from "@ui/skeleton";
import { useEffect, useState } from "react";
import type { TestUnit } from "~/lib/types";
import { api } from "~/trpc/react";
import { TestUnitManager } from "./TestUnitsForm";

const STORAGE_KEY = "calculator-selected-tests";

type TestUnitWithSelected = TestUnit & {
	selected: boolean;
};

export default function UnitCalculator() {
	const { data: dbUnits, isLoading } = api.testUnits.getAll.useQuery();
	const [tests, setTests] = useState<TestUnitWithSelected[]>([]);

	useEffect(() => {
		if (dbUnits) {
			const savedData = localStorage.getItem(STORAGE_KEY);
			const savedParsed = savedData ? JSON.parse(savedData) : {};

			const mergedTests = dbUnits.map((u) => {
				const idStr = String(u.id);
				const hasSaved = savedParsed[idStr];
				return {
					id: u.id,
					name: u.name,
					minutes: u.minutes,
					selected: hasSaved ? hasSaved.selected : false,
				};
			});

			setTests(mergedTests.sort((a, b) => a.name.localeCompare(b.name)));
		}
	}, [dbUnits]);

	useEffect(() => {
		if (tests.length > 0) {
			const dataToSave = tests.reduce(
				(acc: Record<number, { selected: boolean }>, test) => {
					acc[test.id] = { selected: test.selected };
					return acc;
				},
				{},
			);

			localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
		}
	}, [tests]);

	const handleTestSelection = (id: number) => {
		setTests((prev) =>
			prev.map((test) =>
				test.id === id ? { ...test, selected: !test.selected } : test,
			),
		);
	};

	const totalMinutes = tests
		.filter((test) => test.selected)
		.reduce((total, test) => total + (Number(test.minutes) || 0), 0);

	const totalHours = (totalMinutes / 60).toFixed(2);

	if (isLoading) return <Skeleton className="h-96" />;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex flex-col space-y-2">
						<CardTitle>Unit Calculator</CardTitle>
						<CardDescription>
							Select tests to calculate total time.
						</CardDescription>
					</div>
					<TestUnitManager />
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
					{tests.map((test) => (
						<div className="flex items-center space-x-2" key={test.id}>
							<Checkbox
								checked={test.selected}
								id={String(test.id)}
								onCheckedChange={() => handleTestSelection(test.id)}
							/>
							<div className="flex w-1/2 text-sm leading-none">
								<label
									className="grow cursor-pointer"
									htmlFor={String(test.id)}
								>
									{test.name}
								</label>
								<span className="text-muted-foreground">
									{test.minutes} min
								</span>
							</div>
						</div>
					))}
				</div>
			</CardContent>
			<CardFooter>
				<div className="w-full text-right font-bold text-xl">
					Total Time: {totalHours} hours{" "}
					<span className="font-normal text-muted-foreground">
						({totalMinutes} minutes)
					</span>
				</div>
			</CardFooter>
		</Card>
	);
}
