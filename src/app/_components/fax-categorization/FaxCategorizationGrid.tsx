"use client";

import { DashboardStatus } from "@components/client/DashboardStatus";
import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader } from "@ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
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
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { SortedClient } from "~/lib/api-types";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type FaxListItem = RouterOutputs["faxCategorization"]["list"][number];

const CATEGORIES = [
	"Referral",
	"Records Request",
	"Insurance",
	"Insurance Denial",
	"Insurance Approval",
	"Status Update Request",
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
	"Insurance Denial":
		"border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
	"Insurance Approval":
		"border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
	"Status Update Request":
		"border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
	"Patient Documents":
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	Unsure: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function confidenceBadgeClass(confidence: number): string {
	if (confidence >= 0.8) {
		return "border-success/30 bg-success/10 text-success";
	}
	if (confidence >= 0.5) {
		return "border-warning/30 bg-warning/10 text-warning";
	}
	return "border-destructive/30 bg-destructive/10 text-destructive";
}

const OVERRIDDEN_BADGE_CLASSES = "border-warning/30 bg-warning/10 text-warning";

interface FaxLink {
	id: number;
	clientId: number;
	source: "llm" | "manual";
	matchedName: string | null;
	confidence: string | null;
	rejected: boolean;
	client: { hash: string; fullName: string };
}

function activeLinks(links: FaxLink[]): FaxLink[] {
	return links.filter((link) => !link.rejected);
}

function clientsWereChanged(links: FaxLink[]): boolean {
	return links.some((link) => link.rejected || link.source === "manual");
}

function categoryWasChanged(fax: {
	category: string | null;
	llmCategory: string | null;
}): boolean {
	return fax.category !== fax.llmCategory;
}

function wasChangedByReviewer(fax: {
	category: string | null;
	llmCategory: string | null;
	links: FaxLink[];
}): boolean {
	return categoryWasChanged(fax) || clientsWereChanged(fax.links);
}

const REVIEW_FILTERS = ["all", "any", "category", "clients"] as const;
type ReviewFilter = (typeof REVIEW_FILTERS)[number];

const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
	all: "All reviewed faxes",
	any: "Any override",
	category: "Category overridden",
	clients: "Clients overridden",
};

function matchesReviewFilter(
	fax: {
		category: string | null;
		llmCategory: string | null;
		links: FaxLink[];
	},
	filter: ReviewFilter,
): boolean {
	switch (filter) {
		case "all":
			return true;
		case "any":
			return wasChangedByReviewer(fax);
		case "category":
			return categoryWasChanged(fax);
		case "clients":
			return clientsWereChanged(fax.links);
	}
}

export function FaxCategorizationGrid() {
	const [tab, setTab] = useState<"pending" | "reviewed">("pending");
	const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
	const { data: faxes, isLoading } = api.faxCategorization.list.useQuery({
		status: tab,
	});

	const displayedFaxes =
		tab === "reviewed"
			? (faxes?.filter((fax) => matchesReviewFilter(fax, reviewFilter)) ?? [])
			: (faxes ?? []);

	return (
		<Tabs onValueChange={(value) => setTab(value as typeof tab)} value={tab}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<TabsList>
					<TabsTrigger value="pending">Pending</TabsTrigger>
					<TabsTrigger value="reviewed">Reviewed</TabsTrigger>
				</TabsList>
				<div className="flex flex-wrap items-center gap-4">
					{tab === "reviewed" && (
						<Select
							onValueChange={(value) => setReviewFilter(value as ReviewFilter)}
							value={reviewFilter}
						>
							<SelectTrigger className="w-[200px]" id="review-filter">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{REVIEW_FILTERS.map((filter) => (
									<SelectItem key={filter} value={filter}>
										{REVIEW_FILTER_LABELS[filter]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{!isLoading && faxes && faxes.length > 0 && (
						<span className="text-muted-foreground text-sm">
							{displayedFaxes.length} fax
							{displayedFaxes.length === 1 ? "" : "es"}
						</span>
					)}
				</div>
			</div>
			<TabsContent value="pending">
				<FaxGrid faxes={faxes} isLoading={isLoading} status="pending" />
			</TabsContent>
			<TabsContent value="reviewed">
				<FaxGrid
					displayedFaxes={displayedFaxes}
					faxes={faxes}
					isLoading={isLoading}
					status="reviewed"
				/>
			</TabsContent>
		</Tabs>
	);
}

function FaxGrid({
	status,
	faxes,
	isLoading,
	displayedFaxes,
}: {
	status: "pending" | "reviewed";
	faxes: FaxListItem[] | undefined;
	isLoading: boolean;
	displayedFaxes?: FaxListItem[];
}) {
	const utils = api.useUtils();
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

	const shownFaxes =
		status === "reviewed" ? (displayedFaxes ?? []) : (faxes ?? []);

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
			{shownFaxes.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
					<InboxIcon className="h-8 w-8 opacity-20" />
					<p className="text-sm italic">No faxes match this filter.</p>
				</div>
			) : (
				<div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
					{shownFaxes.map((fax) => (
						<Card
							className="h-full cursor-pointer transition-colors hover:bg-muted/50"
							key={fax.id}
							onClick={() => openFax(fax.id, fax.category)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									openFax(fax.id, fax.category);
								}
							}}
							role="button"
							tabIndex={0}
						>
							<CardHeader className="flex flex-row items-start gap-2 space-y-0">
								<FileTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
								<div className="flex flex-col gap-1">
									<span className="font-medium text-sm">{fax.fileName}</span>
									<span className="text-muted-foreground text-xs">
										{status === "reviewed" && fax.reviewedAt
											? `reviewed ${formatDistanceToNow(new Date(fax.reviewedAt), { addSuffix: true })}${fax.reviewedByName ? ` by ${fax.reviewedByName}` : ""}`
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
									{status === "reviewed" &&
										fax.category !== fax.llmCategory && (
											<Badge
												className={OVERRIDDEN_BADGE_CLASSES}
												variant="outline"
											>
												Overridden
											</Badge>
										)}
									{status === "reviewed" && clientsWereChanged(fax.links) && (
										<Badge
											className={OVERRIDDEN_BADGE_CLASSES}
											variant="outline"
										>
											Clients changed
										</Badge>
									)}
								</div>
								{activeLinks(fax.links).length === 0 ? (
									<span className="text-muted-foreground text-xs italic">
										No candidates identified.
									</span>
								) : (
									<div className="flex flex-wrap items-center gap-1">
										{activeLinks(fax.links).map((link) => (
											<Link
												href={`/clients/${link.client.hash}`}
												key={link.id}
												onClick={(e) => e.stopPropagation()}
											>
												<Badge
													className="hover:bg-secondary/70"
													variant="secondary"
												>
													{link.client.fullName}
												</Badge>
											</Link>
										))}
									</div>
								)}
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Dialog
				onOpenChange={(open) => !open && setSelectedFaxId(null)}
				open={selectedFax !== null}
			>
				<DialogContent className="flex max-h-[95vh] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto sm:max-w-[calc(100vw-2rem)]">
					{selectedFax && (
						<>
							<DialogHeader>
								<DialogTitle>{selectedFax.fileName}</DialogTitle>
								<DialogDescription className="sr-only">
									Review and categorize this fax
								</DialogDescription>
							</DialogHeader>
							<div className="grid flex-1 gap-4 md:grid-cols-[2fr_1fr]">
								<iframe
									className="h-[85vh] w-full rounded-md border"
									key={selectedFax.driveFileId}
									src={`/api/fax-categorization/${selectedFax.driveFileId}`}
									title={selectedFax.fileName}
								/>
								<div className="flex flex-col gap-3 overflow-y-auto">
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
											<div className="flex flex-wrap items-center gap-1">
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
												{selectedFax.category !== selectedFax.llmCategory && (
													<Badge
														className={OVERRIDDEN_BADGE_CLASSES}
														variant="outline"
													>
														Overridden
													</Badge>
												)}
											</div>
										)}
										{selectedFax.confidence !== null && (
											<p className="mt-2 text-muted-foreground text-xs">
												LLM guessed{" "}
												<span className="font-medium">
													{selectedFax.llmCategory ?? "Unsure"}
												</span>{" "}
												at {Math.round(Number(selectedFax.confidence) * 100)}%
												confidence.
											</p>
										)}
										{status === "reviewed" && selectedFax.reviewedAt && (
											<p className="mt-2 text-muted-foreground text-xs">
												Reviewed by{" "}
												<span className="font-medium">
													{selectedFax.reviewedByName ?? "someone"}
												</span>{" "}
												on {new Date(selectedFax.reviewedAt).toLocaleString()}
											</p>
										)}
									</div>
									<Separator />
									{status === "pending" ? (
										<div>
											<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
												Candidate client(s)
											</p>
											{activeLinks(selectedFax.links).length === 0 ? (
												<p className="text-muted-foreground text-sm italic">
													No candidates identified.
												</p>
											) : (
												<div className="flex flex-col gap-2">
													{activeLinks(selectedFax.links).map((link) => (
														<div
															className="flex items-center justify-between gap-2 rounded-md border p-2"
															key={link.id}
														>
															<div className="flex flex-col gap-1">
																<div className="flex items-center gap-2">
																	<Link
																		className="text-sm hover:underline"
																		href={`/clients/${link.client.hash}`}
																	>
																		{link.client.fullName}
																	</Link>
																	{link.source === "llm" &&
																		link.confidence !== null &&
																		Number(link.confidence) < 1 && (
																			<Badge
																				className={confidenceBadgeClass(
																					Number(link.confidence),
																				)}
																				variant="outline"
																			>
																				{Math.round(
																					Number(link.confidence) * 100,
																				)}
																				% match on "{link.matchedName}"
																			</Badge>
																		)}
																</div>
																<DashboardStatus clientId={link.clientId} />
															</div>
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
														</div>
													))}
												</div>
											)}
										</div>
									) : (
										<div className="flex flex-col gap-4">
											<div>
												<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
													AI suggested
												</p>
												{selectedFax.links.filter(
													(link) => link.source === "llm",
												).length === 0 ? (
													<p className="text-muted-foreground text-sm italic">
														No candidates identified.
													</p>
												) : (
													<div className="flex flex-col gap-2">
														{selectedFax.links
															.filter((link) => link.source === "llm")
															.map((link) => (
																<div
																	className="flex items-center justify-between gap-2 rounded-md border p-2"
																	key={link.id}
																>
																	<Link
																		className={cn(
																			"text-sm hover:underline",
																			link.rejected &&
																				"text-muted-foreground line-through",
																		)}
																		href={`/clients/${link.client.hash}`}
																	>
																		{link.client.fullName}
																	</Link>
																	{link.rejected ? (
																		<Badge variant="outline">
																			Removed by reviewer
																		</Badge>
																	) : (
																		link.confidence !== null &&
																		Number(link.confidence) < 1 && (
																			<Badge
																				className={confidenceBadgeClass(
																					Number(link.confidence),
																				)}
																				variant="outline"
																			>
																				{Math.round(
																					Number(link.confidence) * 100,
																				)}
																				% match
																			</Badge>
																		)
																	)}
																</div>
															))}
													</div>
												)}
											</div>
											<div>
												<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
													Selected by reviewer
												</p>
												{activeLinks(selectedFax.links).length === 0 ? (
													<p className="text-muted-foreground text-sm italic">
														No clients linked.
													</p>
												) : (
													<div className="flex flex-col gap-2">
														{activeLinks(selectedFax.links).map((link) => (
															<div
																className="flex items-center justify-between gap-2 rounded-md border p-2"
																key={link.id}
															>
																<Link
																	className="text-sm hover:underline"
																	href={`/clients/${link.client.hash}`}
																>
																	{link.client.fullName}
																</Link>
																{link.source === "manual" && (
																	<Badge variant="outline">
																		Added by reviewer
																	</Badge>
																)}
															</div>
														))}
													</div>
												)}
											</div>
										</div>
									)}
									{status === "pending" && (
										<>
											<Separator />
											<div>
												<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
													Link a different client
												</p>
												<ClientSearchAndAdd
													addButtonLabel="Link"
													excludeIds={activeLinks(selectedFax.links).map(
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
													showDob
													status="all"
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
