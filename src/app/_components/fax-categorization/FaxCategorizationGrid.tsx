"use client";

import { DashboardStatus } from "@components/client/DashboardStatus";
import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { ClientDriveFiles } from "@components/referral-faxes/ClientDriveFiles";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader } from "@ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { FileTextIcon, InboxIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SortedClient } from "~/lib/api-types";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const CATEGORIES = [
	"Referral",
	"Records Request",
	"Insurance",
	"Patient Documents",
	"Unsure",
] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_BADGE_CLASSES: Record<Category, string> = {
	Referral:
		"border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
	"Records Request":
		"border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400",
	Insurance:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	"Patient Documents":
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	Unsure: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function confidenceBadgeClass(confidence: number): string {
	if (confidence >= 0.8) {
		return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
	}
	if (confidence >= 0.5) {
		return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
	}
	return "border-destructive/30 bg-destructive/10 text-destructive";
}

export function FaxCategorizationGrid() {
	const [tab, setTab] = useState<"pending" | "reviewed">("pending");

	return (
		<Tabs onValueChange={(value) => setTab(value as typeof tab)} value={tab}>
			<TabsList>
				<TabsTrigger value="pending">Pending</TabsTrigger>
				<TabsTrigger value="reviewed">Reviewed</TabsTrigger>
			</TabsList>
			<TabsContent value="pending">
				<FaxGrid status="pending" />
			</TabsContent>
			<TabsContent value="reviewed">
				<FaxGrid status="reviewed" />
			</TabsContent>
		</Tabs>
	);
}

function FaxGrid({ status }: { status: "pending" | "reviewed" }) {
	const utils = api.useUtils();
	const { data: faxes, isLoading } = api.faxCategorization.list.useQuery({
		status,
	});
	const [selectedFaxId, setSelectedFaxId] = useState<number | null>(null);
	const [selectedCategory, setSelectedCategory] = useState<Category>("Unsure");

	const invalidate = () => utils.faxCategorization.list.invalidate();

	const addLink = api.faxCategorization.confirmLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const removeLink = api.faxCategorization.rejectLink.useMutation({
		onSuccess: () => invalidate(),
	});
	const markReviewed = api.faxCategorization.markReviewed.useMutation({
		onSuccess: () => {
			invalidate();
			setSelectedFaxId(null);
		},
	});

	const selectedFax = faxes?.find((fax) => fax.id === selectedFaxId) ?? null;

	const openFax = (faxId: number, category: string | null) => {
		setSelectedFaxId(faxId);
		setSelectedCategory(
			CATEGORIES.includes(category as Category)
				? (category as Category)
				: "Unsure",
		);
	};

	if (isLoading) {
		return (
			<p className="pt-4 text-muted-foreground text-sm">Loading faxes...</p>
		);
	}

	if (!faxes || faxes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
				<InboxIcon className="h-8 w-8 opacity-20" />
				<p className="text-sm italic">
					{status === "pending"
						? "No faxes awaiting categorization review."
						: "No faxes have been reviewed yet."}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
				{faxes.map((fax) => (
					<button
						className="text-left"
						key={fax.id}
						onClick={() => openFax(fax.id, fax.category)}
						type="button"
					>
						<Card className="h-full transition-colors hover:bg-muted/50">
							<CardHeader className="flex flex-row items-start gap-2 space-y-0">
								<FileTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
								<div className="flex flex-col gap-1">
									<span className="font-medium text-sm">{fax.fileName}</span>
									<span className="text-muted-foreground text-xs">
										{status === "reviewed" && fax.reviewedAt
											? `reviewed ${formatDistanceToNow(new Date(fax.reviewedAt), { addSuffix: true })}`
											: `discovered ${formatDistanceToNow(new Date(fax.discoveredAt), { addSuffix: true })}`}
									</span>
								</div>
							</CardHeader>
							<CardContent className="flex flex-col gap-2">
								<div className="flex flex-wrap items-center gap-1">
									<Badge
										className={cn(
											fax.category &&
												CATEGORY_BADGE_CLASSES[fax.category as Category],
										)}
										variant="outline"
									>
										{fax.category ?? "Unsure"}
									</Badge>
									{fax.confidence !== null && (
										<Badge
											className={confidenceBadgeClass(Number(fax.confidence))}
											variant="outline"
										>
											{Math.round(Number(fax.confidence) * 100)}% confident
										</Badge>
									)}
								</div>
								{fax.links.length === 0 ? (
									<span className="text-muted-foreground text-xs italic">
										No candidates identified.
									</span>
								) : (
									<div className="flex flex-wrap items-center gap-1">
										{fax.links.map((link) => (
											<Badge key={link.id} variant="secondary">
												{link.client.fullName}
											</Badge>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					</button>
				))}
			</div>

			<Dialog
				onOpenChange={(open) => !open && setSelectedFaxId(null)}
				open={selectedFax !== null}
			>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
					{selectedFax && (
						<>
							<DialogHeader>
								<DialogTitle>{selectedFax.fileName}</DialogTitle>
							</DialogHeader>
							<div className="grid gap-4 md:grid-cols-2">
								<iframe
									className="h-[500px] w-full rounded-md border"
									src={`/api/fax-categorization/${selectedFax.driveFileId}`}
									title={selectedFax.fileName}
								/>
								<div className="flex flex-col gap-3">
									<div>
										<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
											Category
										</p>
										{status === "pending" ? (
											<Select
												onValueChange={(value) =>
													setSelectedCategory(value as Category)
												}
												value={selectedCategory}
											>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{CATEGORIES.map((category) => (
														<SelectItem key={category} value={category}>
															{category}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										) : (
											<Badge
												className={cn(
													selectedFax.category &&
														CATEGORY_BADGE_CLASSES[
															selectedFax.category as Category
														],
												)}
												variant="outline"
											>
												{selectedFax.category ?? "Unsure"}
											</Badge>
										)}
										{selectedFax.confidence !== null && (
											<p className="mt-2 text-muted-foreground text-xs">
												LLM guessed{" "}
												<span className="font-medium">
													{selectedFax.category ?? "Unsure"}
												</span>{" "}
												at {Math.round(Number(selectedFax.confidence) * 100)}%
												confidence.
											</p>
										)}
									</div>
									<Separator />
									<div>
										<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
											Candidate client(s)
										</p>
										{selectedFax.links.length === 0 ? (
											<p className="text-muted-foreground text-sm italic">
												No candidates identified.
											</p>
										) : (
											<div className="flex flex-col gap-2">
												{selectedFax.links.map((link) => (
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
													excludeIds={selectedFax.links.map(
														(link) => link.clientId,
													)}
													isAdding={addLink.isPending}
													onAdd={(client: SortedClient) =>
														toast.promise(
															addLink.mutateAsync({
																faxCategorizationId: selectedFax.id,
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
												onClick={() =>
													markReviewed.mutate({
														faxCategorizationId: selectedFax.id,
														category: selectedCategory,
													})
												}
												size="sm"
												variant="outline"
											>
												Mark Reviewed
											</Button>
										</>
									)}
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
