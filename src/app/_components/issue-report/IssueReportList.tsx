"use client";

import { Badge } from "@ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

const TYPE_LABELS = { bug: "Bug", feature: "Feature request" } as const;

export function IssueReportList() {
	const { data: reports, isLoading } = api.issueReport.listMine.useQuery();

	return (
		<div className="flex flex-col gap-4">
			<div>
				<h1 className="text-2xl font-semibold">My Reports</h1>
				<p className="text-sm text-muted-foreground">
					Bug reports and feature requests you sent, or were included on. For
					updates and replies, search your email for the ticket number.
				</p>
			</div>
			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading...</p>
			) : reports?.length === 0 ? (
				<p className="text-sm text-muted-foreground">No reports yet.</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Sent</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Subject</TableHead>
							<TableHead>Ticket</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{reports?.map((report) => (
							<TableRow key={report.id}>
								<TableCell>
									{formatInBusinessTime(report.createdAt, "MMM d, yyyy")}
								</TableCell>
								<TableCell>{TYPE_LABELS[report.type]}</TableCell>
								<TableCell>
									{report.subject}
									{report.sharedWithYou && (
										<Badge className="ml-2" variant="secondary">
											Shared with you
											{report.reporterName ? ` by ${report.reporterName}` : ""}
										</Badge>
									)}
								</TableCell>
								<TableCell>{report.jiraKey ?? "-"}</TableCell>
								<TableCell>
									<Badge variant="outline">
										{report.jiraStatus ?? "Submitted"}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
