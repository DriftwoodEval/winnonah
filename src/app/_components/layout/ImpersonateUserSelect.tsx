"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { VenetianMask } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useMediaQuery } from "~/hooks/use-media-query";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/**
 * "View as another user" control, gated behind the `settings:impersonate` permission.
 * Sets a cookie the NextAuth session callback reads (see src/server/auth/impersonation.ts)
 * so the homepage, permissions, and every other user-scoped call behave as the selected
 * user, not whoever is actually signed in.
 */
export function ImpersonateUserSelect() {
	const { data: session } = useSession();
	const { data: users } = api.users.getAll.useQuery(undefined, {
		enabled: !!session,
	});
	const [pending, setPending] = useState(false);
	// Collapse to the icon-only control below 1024px: the header is too crowded
	// for the full "Acting as" label on narrow laptops and tablets.
	const isDesktop = useMediaQuery("(min-width: 1024px)");

	if (!session) return null;

	const realUserId = session.user.isImpersonating
		? session.user.impersonatorId
		: session.user.id;

	const currentName = session.user.isImpersonating
		? (users?.find((u) => u.id === session.user.id)?.name ??
			session.user.name ??
			session.user.email)
		: "Myself";

	async function viewAs(userId: string | undefined) {
		setPending(true);
		const response = await fetch("/api/impersonate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userId: userId ?? null }),
		});
		if (!response.ok) {
			setPending(false);
			return;
		}
		window.location.reload();
	}

	return (
		<Select
			disabled={pending}
			onValueChange={(v) => viewAs(v === "__self" ? undefined : v)}
			value={session.user.isImpersonating ? session.user.id : "__self"}
		>
			<SelectTrigger
				className={cn("h-7 min-w-0 border-dashed text-xs", isDesktop && "w-44")}
			>
				<SelectValue placeholder="View as...">
					{isDesktop ? (
						`Acting as: ${currentName}`
					) : (
						<>
							<VenetianMask className="h-3.5 w-3.5" />
							<span className="sr-only">Acting as: {currentName}</span>
						</>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__self">Myself</SelectItem>
				{users
					?.filter((u) => u.id !== realUserId)
					.map((u) => (
						<SelectItem key={u.id} value={u.id}>
							{u.name ?? u.email}
						</SelectItem>
					))}
			</SelectContent>
		</Select>
	);
}
