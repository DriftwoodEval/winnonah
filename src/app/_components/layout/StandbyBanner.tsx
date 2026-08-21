import { env } from "~/env";

export function StandbyBanner() {
	if (env.SERVER_ROLE !== "standby") {
		return null;
	}

	return (
		<div className="fixed top-0 z-50 flex h-8 w-full items-center justify-center bg-warning px-2 text-center font-semibold text-sm text-warning-foreground">
			Currently running on the standby server (failover mode).
		</div>
	);
}
