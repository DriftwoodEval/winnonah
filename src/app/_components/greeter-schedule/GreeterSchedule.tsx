"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight, PhoneCall } from "lucide-react";
import { useState } from "react";
import { formatPhoneNumber } from "~/lib/utils";
import { api } from "~/trpc/react";

export default function GreeterSchedule() {
	const [selectedDate, setSelectedDate] = useState(() =>
		format(new Date(), "yyyy-MM-dd"),
	);
	const { data, isLoading } = api.greeterProxy.getSchedule.useQuery({
		date: selectedDate,
	});

	const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

	function navigate(dir: -1 | 1) {
		const anchor = new Date(`${selectedDate}T12:00:00`);
		setSelectedDate(format(addDays(anchor, dir), "yyyy-MM-dd"));
	}

	return (
		<div className="flex w-full flex-col items-center">
			<Card className="w-full max-w-2xl">
				<CardHeader className="flex flex-row flex-wrap items-center gap-4 space-y-0 pb-4">
					<div className="rounded-lg bg-primary/10 p-3 text-primary">
						<PhoneCall className="h-6 w-6" />
					</div>
					<div className="flex flex-1 flex-wrap items-center justify-between gap-3">
						<CardTitle className="text-2xl">
							{isToday ? "Today's Greeters" : "Greeters"}
						</CardTitle>
						<div className="flex items-center gap-1">
							<Button
								className="h-8 w-8"
								onClick={() => navigate(-1)}
								size="icon"
								variant="ghost"
							>
								<ChevronLeft className="h-5 w-5" />
							</Button>
							<span className="w-44 shrink-0 text-center font-medium text-base sm:w-64 sm:text-lg">
								{format(new Date(`${selectedDate}T12:00:00`), "EEEE, MMMM d")}
							</span>
							<Button
								className="h-8 w-8"
								onClick={() => navigate(1)}
								size="icon"
								variant="ghost"
							>
								<ChevronRight className="h-5 w-5" />
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="pb-4">
					{isLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : data?.length ? (
						<Table>
							<TableHeader>
								<TableRow className="h-12 hover:bg-transparent">
									<TableHead className="text-base">Location</TableHead>
									<TableHead className="text-base">Greeter</TableHead>
									<TableHead className="text-base">Phone</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.map((entry) => (
									<TableRow
										className="hover:bg-transparent"
										key={`${entry.location}-${entry.name}`}
									>
										<TableCell className="py-3 font-medium text-lg">
											{entry.location}
										</TableCell>
										<TableCell className="py-3 text-lg">{entry.name}</TableCell>
										<TableCell className="py-3 text-lg">
											{entry.phone ? (
												<a
													className="text-primary hover:underline"
													href={`tel:${entry.phone}`}
												>
													{formatPhoneNumber(entry.phone)}
												</a>
											) : (
												<span className="text-muted-foreground italic">
													No number on file
												</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<p className="text-lg text-muted-foreground italic">
							No schedule found for this day.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
