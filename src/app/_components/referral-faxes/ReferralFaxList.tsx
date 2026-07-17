"use client";

import { DashboardStatus } from "@components/client/DashboardStatus";
import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { ClientDriveFiles } from "@components/referral-faxes/ClientDriveFiles";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Separator } from "@ui/separator";
import { formatDistanceToNow } from "date-fns";
import { FileTextIcon, InboxIcon } from "lucide-react";
import { toast } from "sonner";
import type { SortedClient } from "~/lib/api-types";
import { api } from "~/trpc/react";

export function ReferralFaxList() {
	const utils = api.useUtils();
	const { data: faxes, isLoading } = api.referralFax.list.useQuery({
		status: "pending",
	});

	const invalidate = () => utils.referralFax.list.invalidate();

	const confirmLink = api.referralFax.confirmLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const rejectLink = api.referralFax.rejectLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const markReviewed = api.referralFax.markReviewed.useMutation({
		onSuccess: () => invalidate(),
	});

	if (isLoading) {
		return (
			<p className="text-muted-foreground text-sm">Loading referral faxes...</p>
		);
	}

	if (!faxes || faxes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
				<InboxIcon className="h-8 w-8 opacity-20" />
				<p className="text-sm italic">No referral faxes awaiting review.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{faxes.map((fax) => (
				<Card className="w-full" key={fax.id}>
					<CardHeader className="flex flex-row items-center justify-between space-y-0">
						<div className="flex items-center gap-3">
							<div className="rounded-lg bg-primary/10 p-2 text-primary">
								<FileTextIcon className="h-5 w-5" />
							</div>
							<div>
								<CardTitle className="text-base">{fax.fileName}</CardTitle>
								<p className="text-muted-foreground text-xs">
									discovered{" "}
									{formatDistanceToNow(new Date(fax.discoveredAt), {
										addSuffix: true,
									})}
								</p>
							</div>
						</div>
						<Button
							disabled={markReviewed.isPending}
							onClick={() => markReviewed.mutate({ faxId: fax.id })}
							size="sm"
							variant="outline"
						>
							Mark Reviewed
						</Button>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<iframe
							className="h-[500px] w-full rounded-md border"
							src={`/api/referral-fax/${fax.driveFileId}`}
							title={fax.fileName}
						/>
						<div className="flex flex-col gap-3">
							<div>
								<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Candidate client(s)
								</p>
								{fax.links.length === 0 ? (
									<p className="text-muted-foreground text-sm italic">
										No candidates identified.
									</p>
								) : (
									<div className="flex flex-col gap-2">
										{fax.links.map((link) => (
											<div
												className="flex items-center justify-between gap-2 rounded-md border p-2"
												key={link.id}
											>
												<div className="flex flex-col gap-1">
													<span className="text-sm">
														{link.client.fullName}
													</span>
													<div className="flex flex-wrap items-center gap-1">
														{link.confirmed && (
															<Badge variant="default">Confirmed</Badge>
														)}
													</div>
													<DashboardStatus clientId={link.clientId} />
													<ClientDriveFiles
														clientId={link.clientId}
														firstName={link.client.firstName}
														lastName={link.client.lastName}
													/>
												</div>
												<div className="flex gap-1">
													{!link.confirmed && (
														<Button
															disabled={confirmLink.isPending}
															onClick={() =>
																confirmLink.mutate({
																	faxId: fax.id,
																	clientId: link.clientId,
																	source: link.source,
																})
															}
															size="sm"
														>
															Confirm
														</Button>
													)}
													<Button
														disabled={rejectLink.isPending}
														onClick={() =>
															rejectLink.mutate({ linkId: link.id })
														}
														size="sm"
														variant="ghost"
													>
														Reject
													</Button>
												</div>
											</div>
										))}
									</div>
								)}
							</div>
							<Separator />
							<div>
								<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Link a different client
								</p>
								<ClientSearchAndAdd
									addButtonLabel="Link"
									excludeIds={fax.links.map((link) => link.clientId)}
									isAdding={confirmLink.isPending}
									onAdd={(client: SortedClient) =>
										toast.promise(
											confirmLink.mutateAsync({
												faxId: fax.id,
												clientId: client.id,
												source: "manual",
											}),
											{
												loading: "Linking...",
												success: `Linked ${client.fullName}`,
												error: "Could not link client",
											},
										)
									}
									resetOnAdd
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
