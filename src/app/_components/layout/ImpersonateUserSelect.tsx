"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { useSession } from "next-auth/react";
import { useState } from "react";
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
			<SelectTrigger className="h-7 w-44 border-dashed text-xs">
				<SelectValue placeholder="View as...">
					Acting as: {currentName}
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
