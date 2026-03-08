"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import {
	CheckCircleIcon,
	CheckIcon,
	ExternalLinkIcon,
	FolderIcon,
	LayoutListIcon,
	UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export default function ClaimedReports() {
	const can = useCheckPermission();
	const utils = api.useUtils();

	const { data: reports, isLoading } = api.google.getClaimedReports.useQuery(
		undefined,
		{
			enabled: can("reports:approve"),
		},
	);

	const approveMutation = api.google.approveReport.useMutation();

	const handleApprove = (userId: string, folderName: string) => {
		toast.promise(approveMutation.mutateAsync({ userId }), {
			loading: `Approving "${folderName}"...`,
			success: () => {
				void utils.google.getClaimedReports.invalidate();
				void utils.google.getClaimedFolder.invalidate();
				return `Approved "${folderName}"`;
			},
			error: (err: Error) => err.message,
		});
	};

	if (!can("reports:approve")) return null;

	return (
		<Card className="mx-auto my-4 w-full max-w-2xl shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-success/10 p-2 text-success">
						<LayoutListIcon className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<CardTitle className="text-xl">Claimed Reports</CardTitle>
					</div>
				</div>
			</CardHeader>

			<CardContent className="p-0">
				<ScrollArea className="h-[400px] w-full px-4">
					{isLoading ? (
						<div className="space-y-3 py-4">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : reports && reports.length > 0 ? (
						<div className="grid gap-2 py-2">
							{reports.map((report) => (
								<div
									className="flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted/50"
									key={report.id}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<FolderIcon
												className="fill-primary/20 text-primary"
												size={18}
											/>
											<span className="font-bold text-sm leading-none">
												{report.claimedReportFolder?.name}
											</span>
										</div>
										<div className="flex items-center gap-1">
											<Button
												className="h-8 w-8 text-muted-foreground hover:cursor-pointer"
												onClick={() =>
													window.open(
														`https://drive.google.com/drive/folders/${report.claimedReportFolder?.id}`,
														"_blank",
													)
												}
												size="icon"
												variant="ghost"
											>
												<ExternalLinkIcon className="h-4 w-4" />
												<span className="sr-only">Open in Drive</span>
											</Button>
											<Button
												className="h-8 w-8 text-success hover:cursor-pointer hover:bg-success/10 hover:text-success"
												disabled={approveMutation.isPending}
												onClick={() =>
													handleApprove(
														report.id,
														report.claimedReportFolder?.name ?? "Report",
													)
												}
												size="icon"
												variant="ghost"
											>
												<CheckIcon className="h-4 w-4" />
												<span className="sr-only">Approve and Release</span>
											</Button>
										</div>
									</div>
									<div className="flex items-center gap-2 text-muted-foreground text-xs">
										<UserIcon size={12} />
										<span>{report.name || report.email}</span>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="flex h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
							<CheckCircleIcon className="mb-2 h-8 w-8 opacity-20" />
							<p className="text-sm italic">No reports currently claimed.</p>
						</div>
					)}
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
