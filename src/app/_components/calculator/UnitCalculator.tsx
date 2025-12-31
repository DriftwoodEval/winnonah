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
import { api } from "~/trpc/react";
import { TestUnitManager } from "./TestUnitsForm";

const STORAGE_KEY = "calculator-selected-tests";

export default function UnitCalculator() {
	const { data: dbUnits, isLoading } = api.testUnits.getAll.useQuery();
	const [tests, setTests] = useState<any[]>([]);

	useEffect(() => {
		if (dbUnits) {
			const savedData = localStorage.getItem(STORAGE_KEY);
			const savedParsed = savedData ? JSON.parse(savedData) : {};

			const mergedTests = dbUnits.map((u) => {
				const idStr = String(u.id);
				const hasSaved = savedParsed[idStr];
				return {
					id: idStr,
					name: u.name,
					time: u.minutes,
					selected: hasSaved ? hasSaved.selected : false,
				};
			});

			setTests(mergedTests.sort((a, b) => a.name.localeCompare(b.name)));
		}
	}, [dbUnits]);

	useEffect(() => {
		if (tests.length > 0) {
			const dataToSave = tests.reduce((acc, test) => {
				acc[test.id] = { selected: test.selected };
				return acc;
			}, {});

			localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
		}
	}, [tests]);

	const handleTestSelection = (id: string) => {
		setTests((prev) =>
			prev.map((test) =>
				test.id === id ? { ...test, selected: !test.selected } : test,
			),
		);
	};

	const totalTime = tests
		.filter((test) => test.selected)
		.reduce((total, test) => total + (Number(test.time) || 0), 0);

	const totalHours = (totalTime / 60).toFixed(2);

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
								id={test.id}
								onCheckedChange={() => handleTestSelection(test.id)}
							/>
							<label
								className="grow cursor-pointer font-medium text-sm leading-none"
								htmlFor={test.id}
							>
								{test.name}
							</label>
							<span className="text-muted-foreground text-sm leading-none">
								{test.time} min
							</span>
						</div>
					))}
				</div>
			</CardContent>
			<CardFooter>
				<div className="w-full text-right font-bold text-xl">
					Total Time: {totalHours} hours{" "}
					<span className="font-normal text-muted-foreground">
						({totalTime} minutes)
					</span>
				</div>
			</CardFooter>
		</Card>
	);
}
