import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@ui/card";
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

	const applyTargetTotal = () => {
		const totalUnits = costItems.reduce((sum, item) => sum + item.units, 0);

		if (totalUnits === 0 || targetTotal === 0) return;

		const ratePerUnit = targetTotal / totalUnits;

		setCostItems(
			costItems.map((item) => ({
				...item,
				costPerUnit: Number(ratePerUnit.toFixed(2)),
			})),
		);
	};

	const handleCostItemChange = (
		id: string,
		field: keyof CostItem,
		value: string | number,
	) => {
		setCostItems(
			costItems.map((item) =>
				item.id === id ? { ...item, [field]: value } : item,
			),
		);
	};

	const handleTotalChange = (id: string, newTotal: number) => {
		setCostItems(
			costItems.map((item) => {
				if (item.id === id) {
					// Prevent division by zero; if units are 0, we can't calculate back to costPerUnit easily
					const updatedCostPerUnit =
						item.units !== 0 ? newTotal / item.units : 0;
					return { ...item, costPerUnit: updatedCostPerUnit };
				}
				return item;
			}),
		);
	};

	const addCostItem = () => {
		setCostItems([
			...costItems,
			{ id: crypto.randomUUID(), name: "", units: 0, costPerUnit: 0 },
		]);
	};

	const removeCostItem = (id: string) => {
		setCostItems(costItems.filter((item) => item.id !== id));
	};

	const totalCost = costItems.reduce((total, item) => {
		return total + item.units * item.costPerUnit;
	}, 0);

	const targetTotalId = useId();
	return (
		<Card className="mt-8">
			<CardHeader>
				<CardTitle>Cost Calculator</CardTitle>
				<CardDescription>Add items to calculate total cost.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="mb-6 flex items-end gap-4 rounded-lg bg-muted/50 p-4">
					<div className="grid gap-2">
						<label className="font-medium text-sm" htmlFor="targetTotal">
							Target Total ($)
						</label>
						<Input
							className="w-32"
							id={targetTotalId}
							onChange={(e) => setTargetTotal(Number(e.target.value))}
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
						<TableRow>
							<TableHead className="hidden sm:block">Item</TableHead>
							<TableHead className="w-[150px]">Units</TableHead>
							<TableHead className="w-[150px]">Cost/Unit</TableHead>
							<TableHead className="w-[150px]">Total</TableHead>
							<TableHead className="w-[50px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{costItems.map((item) => (
							<TableRow key={item.id}>
								<TableCell>
									<Select
										onValueChange={(val) =>
											handleCostItemChange(item.id, "name", val)
										}
										value={item.name}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select Code" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="90791">90791</SelectItem>
											<SelectItem value="96136">96136</SelectItem>
											<SelectItem value="96137">96137</SelectItem>
											<SelectItem value="96130">96130</SelectItem>
											<SelectItem value="96131">96131</SelectItem>
										</SelectContent>
									</Select>
								</TableCell>
								<TableCell>
									<Input
										onChange={(e) =>
											handleCostItemChange(
												item.id,
												"units",
												Number.parseFloat(e.target.value || "0"),
											)
										}
										type="number"
										value={item.units}
									/>
								</TableCell>
								<TableCell>
									<div className="flex items-center">
										<span className="mr-1">$</span>
										<Input
											onChange={(e) =>
												handleCostItemChange(
													item.id,
													"costPerUnit",
													Number.parseFloat(e.target.value || "0"),
												)
											}
											type="number"
											value={item.costPerUnit.toFixed(2)}
										/>
									</div>
								</TableCell>
								<TableCell>
									<div className="flex items-center">
										<span className="mr-1">$</span>
										<Input
											onChange={(e) =>
												handleTotalChange(
													item.id,
													Number.parseFloat(e.target.value || "0"),
												)
											}
											type="number"
											value={(item.units * item.costPerUnit).toFixed(2)}
										></Input>
									</div>
								</TableCell>
								<TableCell>
									<Button
										onClick={() => removeCostItem(item.id)}
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
				<Button className="mt-4" onClick={addCostItem}>
					Add Item
				</Button>
			</CardContent>
			<CardFooter>
				<div className="w-full text-right font-bold text-xl">
					Total Cost: ${totalCost.toFixed(2)}
				</div>
			</CardFooter>
		</Card>
	);
}
