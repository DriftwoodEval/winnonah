import { syncDashboardSectionHistory } from "~/lib/dashboard-history";
import { logger } from "~/lib/logger";

const POLL_INTERVAL_MS = 15 * 60 * 1000;

const log = logger.child({ module: "dashboard-history-poll" });

async function pollDashboardSections() {
	while (true) {
		try {
			await syncDashboardSectionHistory();
		} catch (e) {
			log.error(`Failed to sync dashboard section history: ${e}`);
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
}

void pollDashboardSections();
