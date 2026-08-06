"use client";

import { DashboardStatus } from "@components/client/DashboardStatus";
import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { ClientDriveFiles } from "@components/referral-faxes/ClientDriveFiles";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader } from "@ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { Separator } from "@ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { ChevronRightIcon, FileTextIcon, InboxIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SortedClient } from "~/lib/api-types";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export function ReferralFaxList() {
	const [tab, setTab] = useState<"pending" | "reviewed">("pending");

	return (
		<Tabs onValueChange={(value) => setTab(value as typeof tab)} value={tab}>
			<TabsList>
				<TabsTrigger value="pending">Pending</TabsTrigger>
				<TabsTrigger value="reviewed">Reviewed</TabsTrigger>
			</TabsList>
			<TabsContent value="pending">
				<FaxList status="pending" />
			</TabsContent>
			<TabsContent value="reviewed">
				<FaxList status="reviewed" />
			</TabsContent>
		</Tabs>
	);
}

function FaxList({ status }: { status: "pending" | "reviewed" }) {
	const utils = api.useUtils();
	const { data: faxes, isLoading } = api.referralFax.list.useQuery({
		status,
	});
	const [openFaxIds, setOpenFaxIds] = useState<Set<number>>(new Set());

	const invalidate = () => utils.referralFax.list.invalidate();

	const addLink = api.referralFax.confirmLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const removeLink = api.referralFax.rejectLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const markReviewed = api.referralFax.markReviewed.useMutation({
		onSuccess: () => invalidate(),
	});

	const toggleFax = (faxId: number) => {
		setOpenFaxIds((prev) => {
			const next = new Set(prev);
			if (next.has(faxId)) {
				next.delete(faxId);
			} else {
				next.add(faxId);
			}
			return next;
		});
	};

	if (isLoading) {
		return (
			<p className="text-muted-foreground text-sm">Loading referral faxes...</p>
		);
	}

	if (!faxes || faxes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
				<InboxIcon className="h-8 w-8 opacity-20" />
				<p className="text-sm italic">
					{status === "pending"
						? "No referral faxes awaiting review."
						: "No referral faxes have been reviewed yet."}
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 pt-4">
			{faxes.map((fax) => {
				const isOpen = openFaxIds.has(fax.id);
				return (
					<Card className="w-full" key={fax.id}>
						<Collapsible onOpenChange={() => toggleFax(fax.id)} open={isOpen}>
							<CollapsibleTrigger asChild>
								<CardHeader className="flex cursor-pointer flex-row items-center justify-between space-y-0 py-3">
									<div className="flex items-center gap-3">
										<ChevronRightIcon
											className={cn(
												"h-4 w-4 shrink-0 text-muted-foreground transition-transform",
												isOpen && "rotate-90",
											)}
										/>
										<FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
										<span className="font-medium text-sm">{fax.fileName}</span>
										<span className="text-muted-foreground text-xs">
											{status === "reviewed" && fax.reviewedAt
												? `reviewed ${formatDistanceToNow(new Date(fax.reviewedAt), { addSuffix: true })}`
												: `discovered ${formatDistanceToNow(new Date(fax.discoveredAt), { addSuffix: true })}`}
										</span>
									</div>
									{fax.links.length === 0 ? (
										<Badge variant="secondary">No candidates</Badge>
									) : (
										<div className="flex flex-wrap items-center justify-end gap-1">
											{fax.links.map((link) => (
												<Badge key={link.id} variant="secondary">
													{link.client.fullName}
												</Badge>
											))}
										</div>
									)}
								</CardHeader>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<CardContent className="grid gap-4 border-t pt-4 md:grid-cols-2">
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
																<DashboardStatus clientId={link.clientId} />
																<ClientDriveFiles
																	clientId={link.clientId}
																	firstName={link.client.firstName}
																	lastName={link.client.lastName}
																/>
															</div>
															{status === "pending" && (
																<Button
																	disabled={removeLink.isPending}
																	onClick={() =>
																		removeLink.mutate({ linkId: link.id })
																	}
																	size="sm"
																	variant="ghost"
																>
																	Remove
																</Button>
															)}
														</div>
													))}
												</div>
											)}
										</div>
										{status === "pending" && (
											<>
												<Separator />
												<div>
													<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
														Link a different client
													</p>
													<ClientSearchAndAdd
														addButtonLabel="Link"
														excludeIds={fax.links.map((link) => link.clientId)}
														isAdding={addLink.isPending}
														onAdd={(client: SortedClient) =>
															toast.promise(
																addLink.mutateAsync({
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
												<Separator />
												<Button
													className="self-end"
													disabled={markReviewed.isPending}
													onClick={() => markReviewed.mutate({ faxId: fax.id })}
													size="sm"
													variant="outline"
												>
													Mark Reviewed
												</Button>
											</>
										)}
									</div>
								</CardContent>
							</CollapsibleContent>
						</Collapsible>
					</Card>
				);
			})}
		</div>
	);
}
