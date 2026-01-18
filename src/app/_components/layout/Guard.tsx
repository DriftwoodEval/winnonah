"use client";

import { useSession } from "next-auth/react";
import type { PermissionId, PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { AuthRejection } from "./AuthRejection";

interface GuardProps {
	children: React.ReactNode;
	/** If provided, requires this specific permission */
	permission?: PermissionId;
}

export function Guard({ children, permission }: GuardProps) {
	const { data: session, status } = useSession();

	if (status === "loading") return null;

	if (!session) {
		return <AuthRejection reason="unauthenticated" />;
	}

	if (permission) {
		const hasKey = hasPermission(
			session.user.permissions as PermissionsObject,
			permission,
		);
		if (!hasKey) return <AuthRejection reason="unauthorized" />;
	}

	return <>{children}</>;
}
