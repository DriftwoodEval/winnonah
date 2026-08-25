"use client";

import { Card, CardContent } from "@ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { formatDateOnlyMedium } from "~/lib/utils";
import { api } from "~/trpc/react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
});

export default function BabynetReportSettings() {
	const { data: reports, isLoading } = api.babynetReport.list.useQuery();

	return (
		<Card>
			<CardContent>
				<h3 className="mb-3 font-semibold text-sm">BabyNet Weekly Report</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Week Of</TableHead>
							<TableHead>Client Count</TableHead>
							<TableHead>Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading && (
							<TableRow>
								<TableCell className="text-muted-foreground" colSpan={3}>
									Loading...
								</TableCell>
							</TableRow>
						)}
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
								<TableCell>
									{currencyFormatter.format(Number(report.amount))}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
