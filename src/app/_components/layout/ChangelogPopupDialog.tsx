"use client";

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
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatChangelogDate } from "~/lib/utils.client";
import { api } from "~/trpc/react";

interface ChangelogEntryProps {
	date: string;
	body: ReactNode;
}

interface ChangelogPopupDialogProps {
	entries: ChangelogEntryProps[];
	latestMarker: string;
}

export function ChangelogPopupDialog({
	entries,
	latestMarker,
}: ChangelogPopupDialogProps) {
	const [open, setOpen] = useState(true);
	const markChangelogSeen = api.users.markChangelogSeen.useMutation();

	const dismiss = () => {
		setOpen(false);
		markChangelogSeen.mutate({ marker: latestMarker });
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
								<h3 className="font-medium text-muted-foreground text-sm">
									{formatChangelogDate(entry.date)}
								</h3>
								<div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground [&>p:first-child]:mt-0 [&>p]:mt-4 [&>p]:mb-1 [&>ul]:my-0">
									{entry.body}
								</div>
							</div>
						))}
					</div>
				</ScrollArea>
				<div className="flex items-center justify-between rounded-b-xl border-t p-4">
					<Link
						className="text-muted-foreground text-sm underline-offset-4 hover:underline"
						href="/docs/changelog"
						onClick={() => markChangelogSeen.mutate({ marker: latestMarker })}
					>
						View full changelog
					</Link>
					<Button onClick={dismiss}>Got it</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
