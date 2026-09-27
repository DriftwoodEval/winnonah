import RunSummaryList from "~/app/_components/RunSummaryList";
import { WidgetShell } from "./DayAheadWidgets";

export function RunSummaryWidget() {
	return (
		<WidgetShell linkHref="/settings?tab=downloads" title="Run Summary">
			<RunSummaryList />
		</WidgetShell>
	);
}
