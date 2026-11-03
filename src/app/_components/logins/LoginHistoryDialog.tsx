"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Loader2 } from "lucide-react";
import { formatInBusinessTime } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import type { Login } from "./LoginDialog";

type HistoryEntry = RouterOutputs["logins"]["history"][number];

const FIELD_LABELS: Record<string, string> = {
	name: "Name",
	url: "Website",
	notes: "Notes",
};

const ACCESS_LABELS: Record<string, string> = {
	view: "who can view",
	edit: "who can edit",
	delete: "who can delete",
};

/** Plain-language lines describing what one history entry changed. */
function describe(entry: HistoryEntry): string[] {
	const detail = (entry.detail ?? {}) as {
		details?: Record<string, unknown>;
		changedCredentials?: string[];
		access?: Record<string, unknown>;
	};

	switch (entry.action) {
		case "created":
			return ["Created the login"];
		case "deleted":
			return ["Deleted the login"];
		case "access":
			return [
				`Changed ${Object.keys(detail.access ?? {})
					.map((verb) => ACCESS_LABELS[verb] ?? verb)
					.join(", ")}`,
			];
		case "updated": {
			const lines = Object.keys(detail.details ?? {}).map(
				(key) => `Changed ${FIELD_LABELS[key] ?? key}`,
			);
			if (detail.changedCredentials?.length) {
				lines.push(`Changed ${detail.changedCredentials.join(", ")}`);
			}
			return lines;
		}
	}
}

export function LoginHistoryDialog({
	login,
	onClose,
}: {
	login: Login | null;
	onClose: () => void;
}) {
	const { data: history, isLoading } = api.logins.history.useQuery(
		{ id: login?.id ?? 0 },
		{ enabled: !!login },
	);

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={!!login}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>History of {login?.name}</DialogTitle>
					<DialogDescription>
						Who changed this login and when. Passwords and other credential
						values are not recorded.
					</DialogDescription>
				</DialogHeader>
				{isLoading ? (
					<Loader2 className="mx-auto h-6 w-6 animate-spin" />
				) : !history?.length ? (
					<p className="text-sm text-muted-foreground">No changes recorded.</p>
				) : (
					<ul className="space-y-3">
						{history.map((entry) => (
							<li
								className="border-b pb-2 text-sm last:border-b-0"
								key={entry.id}
							>
								<p className="text-xs text-muted-foreground">
									{formatInBusinessTime(entry.createdAt, "MMM d, yyyy h:mm a")}{" "}
									&middot; {entry.changedBy}
								</p>
								{describe(entry).map((line) => (
									<p key={line}>{line}</p>
								))}
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
