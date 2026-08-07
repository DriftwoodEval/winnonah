"use client";

import { formatPhoneNumber } from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	DayNav,
	todayStr,
	useSelectedDate,
	WidgetShell,
} from "./DayAheadWidgets";

export function GreeterScheduleWidget() {
	const { date, shift, resetToToday } = useSelectedDate();
	const { data, isLoading } = api.greeterProxy.getSchedule.useQuery({ date });

	return (
		<WidgetShell
			nav={<DayNav date={date} onShift={shift} onToday={resetToToday} />}
			title="Greeter Schedule"
		>
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : !data?.length ? (
				<p className="text-muted-foreground text-sm">
					No schedule found {date === todayStr() ? "for today" : "this day"}.
				</p>
			) : (
				<div className="divide-y divide-border">
					{data.map((entry) => (
						<div
							className="flex items-center gap-2 py-1.5"
							key={`${entry.location}-${entry.name}`}
						>
							<span className="truncate font-medium text-sm">
								{entry.location}
							</span>
							<span className="truncate text-muted-foreground text-sm">
								{entry.name}
							</span>
							{entry.phone ? (
								<a
									className="ml-auto shrink-0 text-secondary text-xs hover:underline"
									href={`tel:${entry.phone}`}
								>
									{formatPhoneNumber(entry.phone)}
								</a>
							) : (
								<span className="ml-auto shrink-0 text-muted-foreground text-xs italic">
									No number
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}
