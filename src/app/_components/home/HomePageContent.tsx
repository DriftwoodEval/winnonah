"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_HOME_WIDGETS, type WidgetConfig } from "~/lib/home-widgets";
import { api } from "~/trpc/react";
import { ClientWidget } from "./ClientWidget";
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

	const activeWidgets = widgets ?? DEFAULT_HOME_WIDGETS;

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex shrink-0 justify-end px-4 pt-4 pb-2">
				<HomeCustomizer onChange={handleChange} widgets={activeWidgets} />
			</div>
			<div className="grid min-h-0 flex-1 auto-rows-[200px] grid-cols-4 gap-4 overflow-auto px-4 pb-6">
				{activeWidgets.map((w) =>
					w.id === "clients" ? (
						<GridWidgetCell cols={w.cols} key={w.id} rows={w.rows}>
							<ClientWidget />
						</GridWidgetCell>
					) : (
						<GridWidgetCell cols={w.cols} key={w.id} rows={w.rows}>
							<IssueWidgetById cols={w.cols} id={w.id} rows={w.rows} />
						</GridWidgetCell>
					),
				)}
			</div>
		</div>
	);
}
