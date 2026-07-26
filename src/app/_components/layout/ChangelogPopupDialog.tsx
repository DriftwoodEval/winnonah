"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatChangelogDate } from "~/lib/formatChangelogDate";
import { api } from "~/trpc/react";

interface ChangelogEntryProps {
	date: string;
	title: string;
	body: ReactNode;
}

interface ChangelogPopupDialogProps {
	entries: ChangelogEntryProps[];
	latestDate: string;
}

export function ChangelogPopupDialog({
	entries,
	latestDate,
}: ChangelogPopupDialogProps) {
	const [open, setOpen] = useState(true);
	const markChangelogSeen = api.users.markChangelogSeen.useMutation();

	const dismiss = () => {
		setOpen(false);
		markChangelogSeen.mutate({ date: latestDate });
	};

	return (
		<Dialog
			onOpenChange={(next) => {
				if (!next) dismiss();
				else setOpen(next);
			}}
			open={open}
		>
			<DialogContent className="gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="gap-1 p-4">
					<div className="flex items-center gap-2">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<SparklesIcon className="size-4" />
						</span>
						<DialogTitle>What's new</DialogTitle>
					</div>
					<DialogDescription>
						Here's what's changed since your last visit.
					</DialogDescription>
				</DialogHeader>
				<Separator />
				<ScrollArea className="max-h-[min(28rem,60vh)]">
					<div className="flex flex-col divide-y divide-border">
						{entries.map((entry) => (
							<div className="flex flex-col gap-2 p-4" key={entry.date}>
								<div className="flex flex-wrap items-center gap-2">
									<h3 className="font-medium text-sm">{entry.title}</h3>
									<Badge className="text-muted-foreground" variant="outline">
										{formatChangelogDate(entry.date)}
									</Badge>
								</div>
								<div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>ul]:my-0">
									{entry.body}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
				<div className="flex justify-end rounded-b-xl border-t p-4">
					<Button onClick={dismiss}>Got it</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
