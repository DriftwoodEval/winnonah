import { env } from "~/env";
import { syncDashboardSectionHistory } from "~/lib/dashboard-history";
import { runIssueReportWorker } from "~/lib/issue-report-worker";
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

// The standby server must not create tickets or send emails for the same reports.
if (env.SERVER_ROLE === "primary") {
	void runIssueReportWorker();
}
