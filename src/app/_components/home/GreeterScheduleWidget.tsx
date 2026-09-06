"use client";

import { Skeleton } from "@ui/skeleton";
import { formatPhoneNumber } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import {
	DayNav,
	todayStr,
	useSelectedDate,
	WidgetError,
	WidgetShell,
} from "./DayAheadWidgets";

export function GreeterScheduleWidget() {
	const { date, shift, resetToToday } = useSelectedDate();
	const { data, isLoading, isError } = api.greeterProxy.getSchedule.useQuery({
		date,
	});

	return (
		<WidgetShell
			linkHref="/greeter-schedule"
			nav={<DayNav date={date} onShift={shift} onToday={resetToToday} />}
			title="Greeter Schedule"
		>
			{isError ? (
				<WidgetError />
			) : isLoading ? (
				<div className="flex flex-col gap-2 py-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
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
								<Redact>{entry.name}</Redact>
							</span>
							{entry.phone ? (
								<a
									className="ml-auto shrink-0 text-secondary text-xs hover:underline"
									href={`tel:${entry.phone}`}
								>
									<Redact>{formatPhoneNumber(entry.phone)}</Redact>
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
