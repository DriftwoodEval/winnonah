"use client";

import type { JSONContent } from "@tiptap/core";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card, CardContent, CardHeader } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { calculateDiff, extractTextFromTipTap } from "~/lib/diff-utils";
import { api } from "~/trpc/react";

function DiffRenderer({
	diffChanges,
}: {
	diffChanges: ReturnType<typeof calculateDiff>;
}) {
	return (
		<>
			{diffChanges.map((part) => {
				const color = part.added
					? "bg-primary/30 text-primary"
					: part.removed
						? "bg-destructive/30 text-destructive line-through"
						: "text-foreground";
				return (
					<span
						className={`${color} whitespace-pre-wrap rounded px-0.5`}
						key={`${part.value}-${part.added ? "add" : part.removed ? "rm" : "eq"}`}
					>
						{part.value}
					</span>
				);
			})}
		</>
	);
}

export function AppointmentNoteHistory({
	appointmentId,
}: {
	appointmentId: string;
}) {
	const { data: history, isLoading } =
		api.evaluatorDashboard.getNoteHistory.useQuery({ appointmentId });

	if (isLoading) {
		return (
			<div className="text-muted-foreground text-sm">Loading history...</div>
		);
	}

	const versionCards = history
		?.map((version, index) => {
			const previousVersion = history[index + 1];

			const currentText = extractTextFromTipTap(
				version.content as JSONContent | string | null | undefined,
			);
			const previousText = previousVersion
				? extractTextFromTipTap(
						previousVersion.content as JSONContent | string | null | undefined,
					)
				: "";

			const diffChanges = calculateDiff(previousText, currentText);
			const hasChanges = diffChanges.some((p) => p.added || p.removed);

			if (!hasChanges && index !== history.length - 1) return null;

			const isCurrent = "isCurrent" in version;
			const userName = version.updatedByName || version.updatedBy || "Unknown";

			return (
				<Card key={version.id}>
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Avatar className="h-6 w-6">
									{version.updatedByImage ? (
										<AvatarImage alt={userName} src={version.updatedByImage} />
									) : null}
									<AvatarFallback className="text-xs">
										{userName.substring(0, 2).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col">
									<span className="font-medium text-sm">{userName}</span>
									<span className="text-muted-foreground text-xs">
										{version.createdAt &&
											formatDistanceToNow(new Date(version.createdAt), {
												addSuffix: true,
											})}
									</span>
								</div>
							</div>
							{isCurrent && (
								<Badge className="text-xs" variant="outline">
									Current
								</Badge>
							)}
						</div>
					</CardHeader>
					<CardContent className="p-4 pt-0">
						<div className="rounded-md bg-muted/30 p-4 font-mono text-sm leading-relaxed">
							<DiffRenderer diffChanges={diffChanges} />
						</div>
					</CardContent>
				</Card>
			);
		})
		.filter(Boolean);

	if (!versionCards?.length) {
		return (
			<div className="text-muted-foreground text-sm">No history found.</div>
		);
	}

	return (
		<ScrollArea className="max-h-[60vh]">
			<div className="min-w-[400px] space-y-4">{versionCards}</div>
		</ScrollArea>
	);
}
