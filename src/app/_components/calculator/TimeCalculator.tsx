"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@ui/card";
import { DatePicker } from "@ui/date-picker";
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
import { useMemo, useState } from "react";
import { useMediaQuery } from "~/hooks/use-media-query";

interface TimeItem {
	id: string;
	name: string;
	date: Date;
	startTime: string; // HH:mm
	endTime: string; // HH:mm
}

const codes: Record<string, { label: string }> = {
	"90791": { label: "Diagnostic evaluation" },
	"96130": {
		label:
			"(Review) Psychological testing evaluation services by physician or other qualified health care professional - first hour",
	},
	"96131": {
		label:
			"(Report) Psychological testing evaluation services by physician (Each addl. 60 minutes )",
	},
	"96136": {
		label:
			"(Evaluation) Psychological or neuropsychological testing - first 30 min",
	},
	"96137": {
		label:
			"(Evaluation) Psychological or neuropsychological test administration and scoring by physician or other (Each addl. 30 minutes)",
	},
};

const formatDuration = (milliseconds: number) => {
	if (Number.isNaN(milliseconds) || milliseconds < 0) {
		return "0 min";
	}
	const totalMinutes = Math.floor(milliseconds / (1000 * 60));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0) {
		return `${hours} hr ${minutes} min`;
	}
	return `${minutes} min`;
};

const calculateDuration = (item: TimeItem): number => {
	if (!item.date || !item.startTime || !item.endTime) {
		return 0;
	}
	const startDateTime = new Date(
		item.date.getFullYear(),
		item.date.getMonth(),
		item.date.getDate(),
		Number.parseInt(item.startTime.split(":")[0] ?? "", 10),
		Number.parseInt(item.startTime.split(":")[1] ?? "", 10),
	);
	const endDateTime = new Date(
		item.date.getFullYear(),
		item.date.getMonth(),
		item.date.getDate(),
		Number.parseInt(item.endTime.split(":")[0] ?? "", 10),
		Number.parseInt(item.endTime.split(":")[1] ?? "", 10),
	);
	if (endDateTime <= startDateTime) {
		return 0;
	}
	return endDateTime.getTime() - startDateTime.getTime();
};

export default function TimeCalculator() {
	const today = new Date();
	const [timeItems, setTimeItems] = useState<TimeItem[]>([
		{
			id: crypto.randomUUID(),
			name: "90791",
			date: today,
			startTime: "09:00",
			endTime: "10:00",
		},
		{
			id: crypto.randomUUID(),
			name: "96136",
			date: today,
			startTime: "09:00",
			endTime: "09:30",
		},
		{
			id: crypto.randomUUID(),
			name: "96137",
			date: today,
			startTime: "09:00",
			endTime: "14:30",
		},
		{
			id: crypto.randomUUID(),
			name: "96130",
			date: today,
			startTime: "09:00",
			endTime: "10:00",
		},
		{
			id: crypto.randomUUID(),
			name: "96131",
			date: today,
			startTime: "09:00",
			endTime: "13:00",
		},
	]);

	const handleTimeItemChange = (
		id: string,
		field: keyof TimeItem,
		value: string | Date,
	) => {
		setTimeItems((prev) =>
			prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
		);
	};

	const totalDuration = useMemo(() => {
		return timeItems.reduce(
			(total, item) => total + calculateDuration(item),
			0,
		);
	}, [timeItems]);

	const isDesktop = useMediaQuery("(min-width: 768px)");

	return (
		<Card className="mt-8">
			<CardHeader>
				<CardTitle>Time Calculator</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-inherit">
							<TableHead>Item</TableHead>
							<TableHead className="w-[150px]">Date</TableHead>
							<TableHead className="w-[130px]">Start Time</TableHead>
							<TableHead className="w-[130px]">End Time</TableHead>
							<TableHead className="w-[130px]">Duration</TableHead>
							<TableHead className="w-[50px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{timeItems.map((item) => (
							<TableRow className="hover:bg-inherit" key={item.id}>
								<TableCell>
									<Select
										onValueChange={(val) =>
											handleTimeItemChange(item.id, "name", val)
										}
										value={item.name}
									>
										<SelectTrigger>
											<SelectValue placeholder="Code" />
										</SelectTrigger>
										<SelectContent>
											{Object.entries(codes).map(([code, metadata]) => {
												const isSelected = timeItems.some(
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
									<DatePicker
										date={item.date}
										id={`date-${item.id}`}
										setDate={(date) => {
											if (date) {
												handleTimeItemChange(item.id, "date", date);
											}
										}}
									/>
								</TableCell>
								<TableCell>
									<Input
										onChange={(e) =>
											handleTimeItemChange(item.id, "startTime", e.target.value)
										}
										type="time"
										value={item.startTime}
									/>
								</TableCell>
								<TableCell>
									<Input
										onChange={(e) =>
											handleTimeItemChange(item.id, "endTime", e.target.value)
										}
										type="time"
										value={item.endTime}
									/>
								</TableCell>
								<TableCell>
									<div className="font-medium">
										{formatDuration(calculateDuration(item))}
									</div>
								</TableCell>
								<TableCell>
									<Button
										onClick={() =>
											setTimeItems(timeItems.filter((i) => i.id !== item.id))
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
						setTimeItems([
							...timeItems,
							{
								id: crypto.randomUUID(),
								name: "",
								date: new Date(),
								startTime: "10:00",
								endTime: "11:00",
							},
						])
					}
				>
					Add Item
				</Button>
			</CardContent>
			<CardFooter className="justify-end border-t p-6">
				<div className="text-right">
					<p className="text-muted-foreground text-sm">Total Time</p>
					<p className="font-bold text-2xl">{formatDuration(totalDuration)}</p>
				</div>
			</CardFooter>
		</Card>
	);
}
