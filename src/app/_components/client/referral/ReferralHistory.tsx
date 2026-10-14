"use client";

import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import { Skeleton } from "@ui/skeleton";
import { History } from "lucide-react";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

interface ReferralHistoryButtonProps {
	clientId: number;
}

export function ReferralHistoryButton({
	clientId,
}: ReferralHistoryButtonProps) {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					aria-label="Referral history"
					className="px-2"
					size="sm"
					title="Referral history"
					variant="outline"
				>
					<History className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Referral History</DialogTitle>
				</DialogHeader>
				<ReferralHistoryList clientId={clientId} />
			</DialogContent>
		</Dialog>
	);
}

function ReferralHistoryList({ clientId }: { clientId: number }) {
	const { data: history, isLoading } =
		api.clients.getReferralHistory.useQuery(clientId);

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				{["sk-h1", "sk-h2", "sk-h3"].map((k) => (
					<Skeleton className="h-10 w-full" key={k} />
				))}
			</div>
		);
	}

	if (!history || history.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No recorded changes yet.</p>
		);
	}

	return (
		<ul className="flex flex-col gap-3 text-sm">
			{history.map((entry) => (
				<li className="border-b pb-2 last:border-b-0" key={entry.id}>
					<p>{entry.description}</p>
					<p className="text-muted-foreground text-xs">
						{entry.actor} &middot;{" "}
						{formatInBusinessTime(entry.createdAt, "MMM d, yyyy h:mm a")}
					</p>
				</li>
			))}
		</ul>
	);
}
