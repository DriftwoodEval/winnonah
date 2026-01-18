"use client";

import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { PermissionId } from "~/lib/types";
import { AuthRejection } from "./AuthRejection";

interface GuardProps {
	children: React.ReactNode;
	/** If provided, requires this specific permission */
	permission?: PermissionId;
}

export function Guard({ children, permission }: GuardProps) {
	const { data: session, status } = useSession();
	const can = useCheckPermission();

	if (status === "loading") return null;

	if (!session) {
		return <AuthRejection reason="unauthenticated" />;
	}

	if (permission && !can(permission)) {
		return <AuthRejection reason="unauthorized" />;
	}

	return <>{children}</>;
}
