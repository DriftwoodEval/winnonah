"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import { ExternalLinkIcon, FolderIcon, InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface ReportQueueProps {
	sourceId: string;
	destId: string;
}

export default function ReportQueue({ sourceId, destId }: ReportQueueProps) {
	const utils = api.useUtils();

	const { data: folders, isLoading } = api.google.getFolders.useQuery(
		{ parentId: sourceId },
		{ refetchOnWindowFocus: false },
	);

	const claimMutation = api.google.claimTopFolder.useMutation();

	const handleClaim = () => {
		toast.promise(claimMutation.mutateAsync({ sourceId, destId }), {
			loading: "Claiming...",
			success: (data) => {
				void utils.google.getFolders.invalidate();
				return `Claimed "${data.folder_claimed}" into "${data.moved_into}"`;
			},
			error: (err: Error) => err.message,
		});
	};

	return (
		<Card className="mx-auto my-4 w-full max-w-2xl shadow-sm">
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-primary/10 p-2 text-primary">
						<InboxIcon className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<CardTitle className="text-xl">Report Queue</CardTitle>
					</div>
				</div>

				<Button
					className="font-medium"
					disabled={claimMutation.isPending || !folders?.length}
					onClick={handleClaim}
					size="sm"
				>
					{claimMutation.isPending ? "Claiming..." : "Claim Top Folder"}
				</Button>
			</CardHeader>

			<CardContent className="p-0">
				<ScrollArea className="h-[400px] w-full px-4">
					{isLoading ? (
						<div className="space-y-3 py-4">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : folders && folders.length > 0 ? (
						<div className="grid gap-1 py-2">
							{folders.map((folder) => (
								<div
									className="group flex items-center justify-between rounded-md p-3 transition-colors hover:bg-muted/50"
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

									<Button
										className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:cursor-pointer group-hover:opacity-100"
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
					) : (
						<div className="flex h-[200px] flex-col items-center justify-center text-center text-muted-foreground">
							<InboxIcon className="mb-2 h-8 w-8 opacity-20" />
							<p className="text-sm italic">
								No folders found in this directory.
							</p>
						</div>
					)}
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
