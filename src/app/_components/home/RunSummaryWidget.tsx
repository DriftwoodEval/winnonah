import RunSummaryList from "~/app/_components/shared/RunSummaryList";
import { WidgetShell } from "./DayAheadWidgets";

export function RunSummaryWidget() {
	return (
		<WidgetShell linkHref="/settings?page=downloads" title="Run Summary">
			<RunSummaryList />
		</WidgetShell>
	);
}
