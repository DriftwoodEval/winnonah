"use client";

import { Card, CardContent } from "@ui/card";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { formatCurrency, formatDateOnlyMedium } from "~/lib/utils";
import { api } from "~/trpc/react";

export default function BabynetReportSettings() {
	const { data: reports, isLoading } = api.babynetReport.list.useQuery();

	return (
		<Card>
			<CardContent>
				<h3 className="mb-3 text-sm font-semibold">BabyNet Weekly Report</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Week Of</TableHead>
							<TableHead>Client Count</TableHead>
							<TableHead>Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading &&
							Array.from({ length: 3 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								<TableRow key={i}>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-12" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-16" />
									</TableCell>
								</TableRow>
							))}
						{!isLoading && reports?.length === 0 && (
							<TableRow>
								<TableCell className="text-muted-foreground" colSpan={3}>
									No reports yet
								</TableCell>
							</TableRow>
						)}
						{reports?.map((report) => (
							<TableRow key={report.id}>
								<TableCell>{formatDateOnlyMedium(report.weekOf)}</TableCell>
								<TableCell>{report.clientCount}</TableCell>
								<TableCell>{formatCurrency(Number(report.amount))}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
