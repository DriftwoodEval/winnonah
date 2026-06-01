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
import { Label } from "@ui/label";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { Switch } from "@ui/switch";
import { useEffect, useState } from "react";
import {
	aggregateBillingCodes,
	calculateAdditionalAppointments,
} from "~/lib/billing";
import type { AssessmentType } from "~/lib/models";
import { api } from "~/trpc/react";
import { TestUnitManager } from "./TestUnitsForm";

const STORAGE_KEY = "calculator-selected-tests";

type TestUnitWithSelected = AssessmentType & {
	selected: boolean;
};

export default function UnitCalculator() {
	const { data: dbUnits, isLoading } =
		api.questionnaires.getAllTypes.useQuery();
	const [tests, setTests] = useState<TestUnitWithSelected[]>([]);
	const [showUnits, setShowUnits] = useState(false);

	useEffect(() => {
		if (dbUnits) {
			const savedData = localStorage.getItem(STORAGE_KEY);
			const savedParsed = savedData ? JSON.parse(savedData) : {};

			const mergedTests = dbUnits
				.filter((u) => u.minutes != null)
				.map((u) => {
					const idStr = String(u.id);
					const hasSaved = savedParsed[idStr];
					return {
						...u,
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

	const aggregatedCodes =
		showUnits && totalMinutes > 0
			? aggregateBillingCodes(
					calculateAdditionalAppointments(totalMinutes, Infinity),
				)
			: [];

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
				<div className="columns-1 gap-x-6 space-y-2 md:columns-2 lg:columns-3">
					{tests.map((test) => (
						<div
							className="flex break-inside-avoid items-center space-x-2"
							key={test.id}
						>
							<Checkbox
								checked={test.selected}
								id={String(test.id)}
								onCheckedChange={() => handleTestSelection(test.id)}
							/>
							<div className="flex w-full text-sm leading-none md:w-1/2">
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
			<CardFooter className="flex flex-col gap-4">
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-3">
						<Switch
							checked={showUnits}
							id="show-units"
							onCheckedChange={setShowUnits}
						/>
						<Label htmlFor="show-units">Show Units</Label>
					</div>
					<div className="font-bold text-xl">
						Total Time: {totalHours} hours{" "}
						<span className="font-normal text-muted-foreground">
							({totalMinutes} minutes)
						</span>
					</div>
				</div>

				{showUnits && (
					<>
						<Separator />
						<div className="flex w-full flex-col gap-3">
							{aggregatedCodes.length > 0 ? (
								<div className="rounded-md border bg-muted/40 p-4">
									<div className="grid grid-cols-2 gap-2 font-medium text-muted-foreground text-xs uppercase">
										<div>CPT</div>
										<div className="text-right">Units</div>
									</div>
									{aggregatedCodes.map((codeObj) => (
										<div
											className="grid grid-cols-2 items-center gap-2 pt-2"
											key={codeObj.code}
										>
											<div className="font-mono text-sm">{codeObj.code}</div>
											<div className="text-right text-sm">
												{codeObj.units} {codeObj.units === 1 ? "Unit" : "Units"}
											</div>
										</div>
									))}
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									Select tests above to see units.
								</p>
							)}
						</div>
					</>
				)}
			</CardFooter>
		</Card>
	);
}
