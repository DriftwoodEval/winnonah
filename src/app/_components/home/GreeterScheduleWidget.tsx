"use client";

import { Skeleton } from "@ui/skeleton";
import { formatPhoneNumber } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";
import {
	DayNav,
	todayStr,
	useSelectedDate,
	WidgetShell,
} from "./DayAheadWidgets";

export function GreeterScheduleWidget() {
	const { date, shift, resetToToday } = useSelectedDate();
	const { data, isLoading, isError, refetch } =
		api.greeterProxy.getSchedule.useQuery({ date });

	return (
		<WidgetShell
			linkHref="/greeter-schedule"
			nav={<DayNav date={date} onShift={shift} onToday={resetToToday} />}
			title="Greeter Schedule"
		>
			{isError ? (
				<ErrorState compact onRetry={refetch} />
			) : isLoading ? (
				<div className="flex flex-col gap-2 py-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			) : !data?.length ? (
				<EmptyState
					compact
					title={`No schedule found ${date === todayStr() ? "for today" : "this day"}`}
				/>
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
