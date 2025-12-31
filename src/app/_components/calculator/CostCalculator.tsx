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
import { X } from "lucide-react";
import { useId, useState } from "react";
import { useMediaQuery } from "~/hooks/use-media-query";

interface CostItem {
	id: string;
	name: string;
	units: number;
	costPerUnit: number;
}

export default function CostCalculator() {
	const [costItems, setCostItems] = useState<CostItem[]>([
		{ id: crypto.randomUUID(), name: "", units: 0, costPerUnit: 0 },
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
		const totalWeightedUnits = costItems.reduce((sum, item) => {
			const weight = codes[item.name]?.weight ?? 1;
			return sum + item.units * weight;
		}, 0);

		// Prevent division by zero
		if (totalWeightedUnits === 0 || targetTotal === 0) return;

		const baseRate = targetTotal / totalWeightedUnits;
		let runningTotal = 0;

		const newItems = costItems.map((item, index) => {
			const isLast = index === costItems.length - 1;
			const weight = codes[item.name]?.weight ?? 1;

			if (!isLast) {
				const rawRate = baseRate * weight;
				const roundedRate = Number(rawRate.toFixed(2));
				runningTotal += item.units * roundedRate;
				return { ...item, costPerUnit: roundedRate };
			} else {
				// Last item absorbs the difference to hit exactly targetTotal
				const remaining = targetTotal - runningTotal;
				const adjustedRate = item.units !== 0 ? remaining / item.units : 0;
				return { ...item, costPerUnit: adjustedRate };
			}
		});

		setCostItems(newItems);
	};

	const handleCostItemChange = (
		id: string,
		field: keyof CostItem,
		value: string | number,
	) => {
		setCostItems((prev) =>
			prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
		);
	};

	const handleTotalChange = (id: string, newTotal: number) => {
		setCostItems((prev) =>
			prev.map((item) => {
				if (item.id === id) {
					const updatedRate = item.units !== 0 ? newTotal / item.units : 0;
					return { ...item, costPerUnit: updatedRate };
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
				<div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg bg-muted/50 p-4">
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
				</div>
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-inherit">
							<TableHead>Item</TableHead>
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
												return (
													<SelectItem key={code} value={code}>
														{isDesktop ? `${code} - ${metadata.label}` : code}
													</SelectItem>
												);
											})}
										</SelectContent>
									</Select>
								</TableCell>
								<TableCell>
									<Input
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
							{ id: crypto.randomUUID(), name: "", units: 1, costPerUnit: 0 },
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
