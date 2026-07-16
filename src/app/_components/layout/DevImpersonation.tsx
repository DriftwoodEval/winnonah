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
 * Dev-only "view as another user" control. Sets a cookie the NextAuth session callback
 * reads (see src/server/auth/impersonation.ts) so the homepage, permissions, and every
 * other user-scoped call behave as the selected user, not whoever is actually signed in.
 */
export function DevImpersonation() {
	const { data: session } = useSession();
	const { data: users } = api.users.getAll.useQuery(undefined, {
		enabled: !!session,
	});
	const [pending, setPending] = useState(false);

	if (!session) return null;

	async function viewAs(userId: string | undefined) {
		setPending(true);
		await fetch("/api/dev/impersonate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userId: userId ?? null }),
		});
		window.location.reload();
	}

	return (
		<Select
			disabled={pending}
			onValueChange={(v) => viewAs(v === "__self" ? undefined : v)}
			value={session.user.isImpersonating ? session.user.id : "__self"}
		>
			<SelectTrigger className="h-7 w-44 border-dashed text-xs">
				<SelectValue placeholder="View as..." />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__self">Myself</SelectItem>
				{users?.map((u) => (
					<SelectItem key={u.id} value={u.id}>
						{u.name ?? u.email}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
