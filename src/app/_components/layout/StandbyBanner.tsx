import { env } from "~/env";

export function StandbyBanner() {
	if (env.SERVER_ROLE !== "standby") {
		return null;
	}

	return (
		<div className="fixed top-0 z-50 flex h-8 w-full items-center justify-center bg-amber-500 px-2 text-center font-semibold text-amber-950 text-sm">
			Running on the standby server (failover mode). The primary server may be
			down.
		</div>
	);
}
