import type { BetterAuthClientPlugin } from "better-auth/client";
import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { authInstance } from "~/server/auth/config";
import type { impersonation } from "~/server/auth/impersonation";

const impersonationClient = () =>
	({
		id: "impersonation",
		$InferServerPlugin: {} as ReturnType<typeof impersonation>,
	}) satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
	plugins: [customSessionClient<typeof authInstance>(), impersonationClient()],
	// Re-check the session every 30 seconds so a revoked or expired session
	// shows up without a page load.
	sessionOptions: { refetchOnWindowFocus: false, refetchInterval: 30 },
});
