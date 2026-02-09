"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Lock, LockOpen, X } from "lucide-react";
import { useId, useState } from "react";
import { useMediaQuery } from "~/hooks/use-media-query";

interface CostItem {
	id: string;
	name: string;
	units: number;
	costPerUnit: number;
	isLocked: boolean;
	weight: number;
}

export default function CostCalculator() {
	const [costItems, setCostItems] = useState<CostItem[]>([
		{
			id: crypto.randomUUID(),
			name: "90791",
			units: 1,
			costPerUnit: 0,
			isLocked: false,
			weight: 2,
		},
		{
			id: crypto.randomUUID(),
			name: "96136",
			units: 1,
			costPerUnit: 0,
			isLocked: false,
			weight: 1,
		},
		{
			id: crypto.randomUUID(),
			name: "96137",
			units: 11,
			costPerUnit: 0,
			isLocked: false,
			weight: 1,
		},
		{
			id: crypto.randomUUID(),
			name: "96130",
			units: 1,
			costPerUnit: 0,
			isLocked: false,
			weight: 2,
		},
		{
			id: crypto.randomUUID(),
			name: "96131",
			units: 3,
			costPerUnit: 0,
			isLocked: false,
			weight: 2,
		},
	]);
	const [targetTotal, setTargetTotal] = useState<number>(2000);
	const [activeField, setActiveField] = useState<{
		id: string;
		field: string;
	} | null>(null);

	const codes: Record<string, { label: string; weight: number }> = {
		"90791": { label: "Diagnostic evaluation", weight: 2 },
		"96130": {
			label:
				"(Review) Psychological testing evaluation services by physician or other qualified health care professional - first hour",
			weight: 2,
		},
		"96131": {
			label:
				"(Report) Psychological testing evaluation services by physician (Each addl. 60 minutes )",
			weight: 2,
		},
		"96136": {
			label:
				"(Evaluation) Psychological or neuropsychological testing - first 30 min",
			weight: 1,
		},
		"96137": {
			label:
				"(Evaluation) Psychological or neuropsychological test administration and scoring by physician or other (Each addl. 30 minutes)",
			weight: 1,
		},
	};

	const applyTargetTotal = () => {
		const targetCents = Math.round(targetTotal * 100);

		const lockedItems = costItems.filter((item) => item.isLocked);
		const unlockedItems = costItems.filter((item) => !item.isLocked);

		const lockedTotalCents = Math.round(
			lockedItems.reduce(
				(sum, item) => sum + item.units * item.costPerUnit * 100,
				0,
			),
		);

		const remainingCents = targetCents - lockedTotalCents;
		const totalWeightedUnits = unlockedItems.reduce((sum, item) => {
			return sum + item.units * item.weight;
		}, 0);

		// Prevent division by zero
		if (totalWeightedUnits === 0) return;

		const baseRate = remainingCents / 100 / totalWeightedUnits;

		const newItems = costItems.map((item) => {
			if (item.isLocked) return { ...item };
			const roundedRate = Math.round(baseRate * item.weight * 100) / 100;
			return { ...item, costPerUnit: roundedRate };
		});

		const getCurrentTotalCents = (items: CostItem[]) =>
			Math.round(
				items.reduce(
					(sum, item) => sum + item.units * item.costPerUnit * 100,
					0,
				),
			);

		let diffCents = targetCents - getCurrentTotalCents(newItems);

		// Greedily reduce diffCents using items with largest possible units that fit.
		// This keeps the costPerUnit change as small as possible (1 cent at a time).
		while (diffCents !== 0) {
			const step = diffCents > 0 ? 1 : -1;
			const absDiff = Math.abs(diffCents);

			// Find unlocked items with units > 0 that can help reduce diffCents without overshooting
			const candidates = newItems
				.filter(
					(item) => !item.isLocked && item.units > 0 && item.units <= absDiff,
				)
				.sort((a, b) => b.units - a.units);

			if (candidates.length === 0) break;

			const bestItem = candidates[0];
			if (bestItem) {
				bestItem.costPerUnit = Number(
					(bestItem.costPerUnit + step * 0.01).toFixed(2),
				);
				diffCents -= step * bestItem.units;
			}
		}

		setCostItems(newItems);
	};

	const handleCostItemChange = (
		id: string,
		field: keyof CostItem,
		value: string | number | boolean,
	) => {
		setCostItems((prev) =>
			prev.map((item) => {
				if (item.id === id) {
					const newItem = { ...item, [field]: value };
					// Automatically lock the rate if it's manually edited
					if (field === "costPerUnit") {
						newItem.isLocked = true;
					}
					// Apply default weight when a billing code is selected
					if (field === "name" && typeof value === "string") {
						newItem.weight = codes[value]?.weight ?? 1;
					}
					return newItem;
				}
				return item;
			}),
		);
	};

	const handleTotalChange = (id: string, newTotal: number) => {
		setCostItems((prev) =>
			prev.map((item) => {
				if (item.id === id) {
					// Calculate rate from desired total and lock it
					const updatedRate = item.units !== 0 ? newTotal / item.units : 0;
					return { ...item, costPerUnit: updatedRate, isLocked: true };
				}
				return item;
			}),
		);
	};

	const totalCost = costItems.reduce(
		(total, item) => total + item.units * item.costPerUnit,
		0,
	);
	const targetTotalId = useId();

	const renderNumericInput = (
		item: CostItem,
		field: string,
		value: number,
		onChange: (val: number) => void,
	) => {
		const isEditing =
			activeField?.id === item.id && activeField?.field === field;
		return (
			<Input
				min="0"
				onBlur={() => setActiveField(null)}
				onChange={(e) =>
					onChange(
						e.target.value === "" ? 0 : Number.parseFloat(e.target.value),
					)
				}
				onFocus={(e) => {
					e.target.select();
					setActiveField({ id: item.id, field });
				}}
				step="0.01"
				type="number"
				value={isEditing ? value || "" : value.toFixed(2)}
			/>
		);
	};

	const isDesktop = useMediaQuery("(min-width: 768px)");

	return (
		<Card className="mt-8">
			<CardHeader>
				<CardTitle>Cost Calculator</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="mb-6 flex flex-wrap items-end gap-4 rounded-md bg-muted/50 p-4">
					<div className="grid gap-2">
						<label className="font-medium text-sm" htmlFor={targetTotalId}>
							Target Total ($)
						</label>
						<Input
							className="w-32"
							id={targetTotalId}
							onChange={(e) => setTargetTotal(Number(e.target.value))}
							onFocus={(e) => e.target.select()}
							type="number"
							value={targetTotal}
						/>
					</div>
					<Button onClick={applyTargetTotal} variant="secondary">
						Calculate Rates
					</Button>
					<Button
						onClick={() =>
							setCostItems((prev) =>
								prev.map((i) => ({ ...i, isLocked: false })),
							)
						}
						variant="ghost"
					>
						Clear All Locks
					</Button>
				</div>
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-inherit">
							<TableHead className="w-[50px]">Lock</TableHead>
							<TableHead>Item</TableHead>
							<TableHead className="w-[100px]">Weight</TableHead>
							<TableHead className="w-[120px]">Units</TableHead>
							<TableHead className="w-[150px]">Cost/Unit</TableHead>
							<TableHead className="w-[150px]">Total</TableHead>
							<TableHead className="w-[50px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{costItems.map((item) => (
							<TableRow className="hover:bg-inherit" key={item.id}>
								<TableCell>
									<Button
										className="h-8 w-8"
										onClick={() =>
											handleCostItemChange(item.id, "isLocked", !item.isLocked)
										}
										size="icon"
										variant="ghost"
									>
										{item.isLocked ? (
											<Lock className="h-4 w-4 text-primary" />
										) : (
											<LockOpen className="h-4 w-4 text-muted-foreground/50" />
										)}
									</Button>
								</TableCell>
								<TableCell>
									<Select
										onValueChange={(val) =>
											handleCostItemChange(item.id, "name", val)
										}
										value={item.name}
									>
										<SelectTrigger>
											<SelectValue placeholder="Code" />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(codes).map(([code, metadata]) => {
												const isSelected = costItems.some(
													(i) => i.name === code && i.id !== item.id,
												);
												return (
													<SelectItem
														disabled={isSelected}
														key={code}
														value={code}
													>
														{isDesktop ? `${code} - ${metadata.label}` : code}
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
								</TableCell>
								<TableCell>
									<Input
										min="1"
										onChange={(e) =>
											handleCostItemChange(
												item.id,
												"weight",
												Number(e.target.value),
											)
										}
										onFocus={(e) => e.target.select()}
										type="number"
										value={item.weight}
									/>
								</TableCell>
								<TableCell>
									<Input
										min="0"
										onChange={(e) =>
											handleCostItemChange(
												item.id,
												"units",
												Number(e.target.value),
											)
										}
										onFocus={(e) => e.target.select()}
										type="number"
										value={item.units}
									/>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<span>$</span>
										{renderNumericInput(
											item,
											"costPerUnit",
											item.costPerUnit,
											(val) =>
												handleCostItemChange(item.id, "costPerUnit", val),
										)}
									</div>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-1">
										<span>$</span>
										{renderNumericInput(
											item,
											"rowTotal",
											item.units * item.costPerUnit,
											(val) => handleTotalChange(item.id, val),
										)}
									</div>
								</TableCell>
								<TableCell>
									<Button
										onClick={() =>
											setCostItems(costItems.filter((i) => i.id !== item.id))
										}
										size="icon"
										variant="ghost"
									>
										<X className="h-4 w-4" />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<Button
					className="mt-4"
					onClick={() =>
						setCostItems([
							...costItems,
							{
								id: crypto.randomUUID(),
								name: "",
								units: 1,
								costPerUnit: 0,
								isLocked: false,
								weight: 1,
							},
						])
					}
				>
					Add Item
				</Button>
			</CardContent>
			<CardFooter className="justify-end border-t p-6">
				<div className="text-right">
					<p className="text-muted-foreground text-sm">Total Cost</p>
					<p className="font-bold text-2xl">${totalCost.toFixed(2)}</p>
				</div>
			</CardFooter>
		</Card>
	);
}
