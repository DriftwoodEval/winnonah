"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { VenetianMask } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMediaQuery } from "~/hooks/use-media-query";
import { authClient } from "~/lib/auth-client";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/**
 * "View as another user" control, gated behind the `settings:impersonate` permission.
 * Switches to a temporary session for the selected user (see
 * src/server/auth/impersonation.ts) so the homepage, permissions, and every
 * other user-scoped call behave as that user, not whoever is actually signed in.
 */
export function ImpersonateUserSelect() {
	const { data: session } = authClient.useSession();
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
		try {
			if (userId) {
				const { error } = await authClient.impersonation.start({ userId });
				if (error) throw new Error(error.message);
			} else {
				const { error } = await authClient.impersonation.stop();
				if (error) throw new Error(error.message);
			}
			window.location.reload();
		} catch (error) {
			setPending(false);
			toast.error(error instanceof Error ? error.message : "Could not switch.");
		}
	}

	return (
		<Select
			disabled={pending}
			onValueChange={(v) => viewAs(v === "__self" ? undefined : v)}
			value={session.user.isImpersonating ? session.user.id : "__self"}
		>
			<SelectTrigger
				className={cn(
					"h-7 min-w-0 border-dashed text-xs max-md:data-[size=default]:h-8",
					isDesktop && "w-44",
				)}
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
