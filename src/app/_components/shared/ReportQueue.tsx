"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import {
	AlertCircleIcon,
	ExternalLinkIcon,
	FolderIcon,
	InboxIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface ReportQueueProps {
	sourceId: string;
	destId: string;
}

export default function ReportQueue({ sourceId, destId }: ReportQueueProps) {
	const utils = api.useUtils();

	const { data: folders, isLoading: foldersLoading } =
		api.google.getFolders.useQuery(
			{ parentId: sourceId },
			{ refetchOnWindowFocus: false },
		);

	const { data: claimedData, isLoading: claimedLoading } =
		api.google.getClaimedFolders.useQuery();

	const { data: writerFolder } = api.google.getWriterFolder.useQuery(
		{ parentId: destId },
		{ refetchOnWindowFocus: false },
	);

	const claimMutation = api.google.claimTopFolder.useMutation();

	const handleClaim = () => {
		toast.promise(claimMutation.mutateAsync({ sourceId, destId }), {
			loading: "Claiming...",
			success: (data) => {
				void utils.google.getFolders.invalidate();
				void utils.google.getClaimedFolders.invalidate();
				void utils.google.getClaimedReports.invalidate();
				return `Claimed "${data.folder_claimed}" into "${data.moved_into}"`;
			},
			error: (err: Error) => err.message,
		});
	};

	const isLoading = foldersLoading || claimedLoading;

	const claimedFolders = claimedData?.folders ?? [];
	const effectiveMax = claimedData?.effectiveMax ?? 1;
	const atLimit = claimedFolders.length >= effectiveMax;

	return (
		<Card className="mx-auto my-4 w-full max-w-2xl shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-primary/10 p-2 text-primary">
						<InboxIcon className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<CardTitle className="text-xl">Report Queue</CardTitle>
						{!claimedLoading && (
							<p
								className={
									atLimit
										? "font-medium text-sm text-warning"
										: "text-muted-foreground text-sm"
								}
							>
								{claimedFolders.length} of {effectiveMax} report
								{effectiveMax !== 1 ? "s" : ""} claimed
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2">
					{writerFolder && (
						<Button
							className="cursor-pointer font-medium"
							onClick={() =>
								window.open(
									`https://drive.google.com/drive/folders/${writerFolder.id}`,
									"_blank",
								)
							}
							size="sm"
							variant="outline"
						>
							<FolderIcon className="h-4 w-4" />
							My Folder
						</Button>
					)}
					<Button
						className="font-medium hover:cursor-pointer"
						disabled={claimMutation.isPending || !folders?.length || atLimit}
						onClick={handleClaim}
						size="sm"
						title={
							atLimit
								? effectiveMax === 1
									? "Your current report must be approved before claiming another"
									: `You've reached your limit of ${effectiveMax} claimed reports`
								: undefined
						}
					>
						{claimMutation.isPending ? "Claiming..." : "Claim Next Report"}
					</Button>
				</div>
			</CardHeader>

			<CardContent className="p-0">
				<ScrollArea className="h-[400px] w-full px-4">
					{isLoading ? (
						<div className="space-y-3 py-4">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : (
						<>
							{claimedFolders.length > 0 && (
								<div className="my-2 border-b pb-2">
									{atLimit && (
										<div className="mb-2 flex items-center gap-2 font-medium text-sm text-warning">
											<AlertCircleIcon size={16} />
											{effectiveMax === 1
												? "Must be approved before claiming another."
												: "Reports must be approved before claiming another."}
										</div>
									)}
									<div className="flex flex-col gap-2">
										{claimedFolders.map((folder) => (
											<div
												className="flex items-center justify-between rounded-md bg-amber-50 p-3 dark:bg-amber-950/20"
												key={folder.id}
											>
												<div className="flex items-center gap-3">
													<FolderIcon
														className="fill-amber-500 text-amber-500"
														size={18}
													/>
													<span className="font-bold text-sm leading-none">
														{folder.name}
													</span>
												</div>
												<Button
													className="h-8 w-8 text-amber-600 hover:cursor-pointer hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/30"
													onClick={() =>
														window.open(
															`https://drive.google.com/drive/folders/${folder.id}`,
															"_blank",
														)
													}
													size="icon"
													variant="ghost"
												>
													<ExternalLinkIcon className="h-4 w-4" />
													<span className="sr-only">Open in Drive</span>
												</Button>
											</div>
										))}
									</div>
								</div>
							)}

							{folders && folders.length > 0 ? (
								<div className="grid gap-1 py-2">
									{folders.map((folder) => (
										<div
											className="group flex items-center justify-between rounded-md p-3"
											key={folder.id}
										>
											<div className="flex items-center gap-3">
												<FolderIcon
													className="fill-amber-500/20 text-amber-500"
													size={18}
												/>
												<span className="font-medium text-sm leading-none">
													{folder.name}
												</span>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="flex h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
									<InboxIcon className="mb-2 h-8 w-8 opacity-20" />
									<p className="text-sm italic">
										No folders found in this directory.
									</p>
								</div>
							)}
						</>
					)}
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
