"use client";

import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { PermissionId } from "~/lib/types";
import { AuthRejection } from "./AuthRejection";

interface GuardProps {
	children: React.ReactNode;
	/** Requires this specific permission */
	permission?: PermissionId;
	/** Requires at least one of these permissions */
	anyOf?: PermissionId[];
}

export function Guard({ children, permission, anyOf }: GuardProps) {
	const { data: session, status } = useSession();
	const can = useCheckPermission();

	if (status === "loading") return null;

	if (!session) {
		return <AuthRejection reason="unauthenticated" />;
	}

	if (permission && !can(permission)) {
		return <AuthRejection reason="unauthorized" />;
	}

	if (anyOf && !anyOf.some(can)) {
		return <AuthRejection reason="unauthorized" />;
	}

	return <>{children}</>;
}
