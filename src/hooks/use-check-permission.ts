import { useSession } from "~/lib/auth-client";
import type { PermissionId } from "~/lib/types";
import { hasPermission } from "~/lib/utils";

export function useCheckPermission() {
	const { data: session } = useSession();

	return (id: PermissionId) => {
		if (!session?.user?.permissions) return false;
		return hasPermission(session.user.permissions, id);
	};
}
