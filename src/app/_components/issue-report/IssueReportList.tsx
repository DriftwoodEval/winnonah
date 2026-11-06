"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

const TYPE_LABELS = { bug: "Bug", feature: "Feature request" } as const;

export function IssueReportList() {
	const canViewAll = useCheckPermission()("settings:issue-report:edit");
	const [showAll, setShowAll] = useState(false);
	const all = canViewAll && showAll;
	const mine = api.issueReport.listMine.useQuery(undefined, { enabled: !all });
	const everyone = api.issueReport.listAll.useQuery(undefined, {
		enabled: all,
	});
	const { data: reports, isLoading } = all ? everyone : mine;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">
						{all ? "All Bug Reports" : "My Bug Reports"}
					</h1>
					<p className="text-sm text-muted-foreground">
						{all
							? "Bug reports and feature requests sent by everyone."
							: "Bug reports and feature requests you sent, or were included on. For updates and replies, search your email for the ticket number."}
					</p>
				</div>
				{canViewAll && (
					<Button onClick={() => setShowAll(!showAll)} variant="outline">
						{all ? "Show only mine" : "Show all reports"}
					</Button>
				)}
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
							{all && <TableHead>Sent by</TableHead>}
							{all && <TableHead>Included</TableHead>}
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
								{all && <TableCell>{report.reporterName}</TableCell>}
								{all && (
									<TableCell>
										{"ccEmails" in report && report.ccEmails?.length
											? report.ccEmails.join(", ")
											: "-"}
									</TableCell>
								)}
								<TableCell>{TYPE_LABELS[report.type]}</TableCell>
								<TableCell>
									{report.subject}
									{"sharedWithYou" in report && report.sharedWithYou && (
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
