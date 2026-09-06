"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Card, CardContent } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { format, formatDistanceToNowStrict } from "date-fns";
import { api } from "~/trpc/react";

export function InsuranceReviewClaimHistory({
	clientId,
}: {
	clientId: number;
}) {
	const { data: claimHistory, isLoading } =
		api.insuranceReview.getClaimHistory.useQuery({ clientId });

	if (isLoading)
		return (
			<div className="text-muted-foreground text-sm">Loading history...</div>
		);

	if (!claimHistory?.length)
		return (
			<div className="text-muted-foreground text-sm">No history found.</div>
		);

	return (
		<ScrollArea>
			<div className="space-y-3">
				{claimHistory.map((entry) => {
					const userName = entry.userName || entry.userEmail;
					const setByName = entry.setBy ? entry.setByName || entry.setBy : null;

					return (
						<Card key={entry.id}>
							<CardContent className="flex items-center gap-3 p-4">
								<Avatar className="h-8 w-8">
									{entry.userImage ? (
										<AvatarImage alt={userName} src={entry.userImage} />
									) : null}
									<AvatarFallback className="text-xs">
										{userName.substring(0, 2).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col">
									<span className="font-medium text-sm">
										Assigned to {userName}
										{setByName && setByName !== userName && (
											<span className="font-normal text-muted-foreground">
												{" "}
												by {setByName}
											</span>
										)}
									</span>
									<span className="text-muted-foreground text-xs">
										{format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")} (
										{formatDistanceToNowStrict(new Date(entry.createdAt), {
											addSuffix: true,
										})}
										)
									</span>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</ScrollArea>
	);
}
