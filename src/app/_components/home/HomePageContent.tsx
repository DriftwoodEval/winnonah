"use client";

import { useCallback, useEffect, useState } from "react";
import {
	DEFAULT_HOME_WIDGETS,
	HOME_WIDGET_DEFS,
	type WidgetConfig,
} from "~/lib/home-widgets";
import { api } from "~/trpc/react";
import {
	MyInsuranceClientsWidget,
	RecentClientsWidget,
} from "./ClientListWidgets";
import { ClientWidget } from "./ClientWidget";
import { DashboardSectionWidget } from "./DashboardSectionWidget";
import { MyDayWidget, WhosInWidget } from "./DayAheadWidgets";
import { GridWidgetCell } from "./GridWidgetCell";
import { HomeCustomizer } from "./HomeCustomizer";
import { IssueWidgetById } from "./IssueWidgetById";

export function HomePageContent() {
	const utils = api.useUtils();
	const { data: savedWidgets, isLoading } = api.users.getHomeWidgets.useQuery();
	const { mutate: saveWidgets } = api.users.updateHomeWidgets.useMutation({
		onSuccess: () => {
			utils.users.getHomeWidgets.invalidate();
		},
	});

	const [widgets, setWidgets] = useState<WidgetConfig[] | null>(null);

	useEffect(() => {
		if (!isLoading && widgets === null) {
			setWidgets(savedWidgets ?? DEFAULT_HOME_WIDGETS);
		}
	}, [isLoading, savedWidgets, widgets]);

	const handleChange = useCallback(
		(next: WidgetConfig[]) => {
			setWidgets(next);
			saveWidgets({ widgets: next });
		},
		[saveWidgets],
	);

	// Don't render until we know what the user's config is — avoids a flash of the default layout
	if (isLoading && widgets === null) return null;

	const activeWidgets = widgets ?? DEFAULT_HOME_WIDGETS;

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div className="absolute top-3 right-3 z-10">
				<HomeCustomizer onChange={handleChange} widgets={activeWidgets} />
			</div>
			<div className="h-full overflow-auto">
				<div className="grid grid-cols-1 gap-4 p-4 sm:grid-flow-dense sm:grid-cols-4">
					{activeWidgets.map((w) => {
						return (
							<GridWidgetCell cols={w.cols} key={w.id} rows={w.rows}>
								{(() => {
									const def = HOME_WIDGET_DEFS.find((d) => d.id === w.id);
									if (def?.dashboardSection) {
										return (
											<DashboardSectionWidget
												sectionTitle={def.dashboardSection}
											/>
										);
									}
									if (w.id === "clients") return <ClientWidget />;
									if (w.id === "recent-clients") return <RecentClientsWidget />;
									if (w.id === "my-insurance-clients")
										return <MyInsuranceClientsWidget />;
									if (w.id === "day-ahead-mine") return <MyDayWidget />;
									if (w.id === "day-ahead-offices") return <WhosInWidget />;
									return <IssueWidgetById id={w.id} />;
								})()}
							</GridWidgetCell>
						);
					})}
				</div>
			</div>
		</div>
	);
}
