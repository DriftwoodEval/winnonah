"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

interface OfficeDriveTimesButtonProps {
	clientId: number;
}

function formatDriveTime(minutes: number): string {
	const total = Math.round(minutes);
	const hours = Math.floor(total / 60);
	const mins = total % 60;
	if (hours === 0) return `${mins} min`;
	if (mins === 0) return `${hours} hr`;
	return `${hours} hr ${mins} min`;
}

export function OfficeDriveTimesButton({
	clientId,
}: OfficeDriveTimesButtonProps) {
	const [enabled, setEnabled] = useState(false);
	const utils = api.useUtils();
	const driveTimes = api.clients.getOfficeDriveTimes.useQuery(clientId, {
		enabled,
		refetchOnWindowFocus: false,
		staleTime: 5 * 60 * 1000,
	});

	// The server persists every lookup back to the closest-office ranking, so
	// reopening this popover (which refetches once staleTime has passed)
	// doubles as a refresh of that ranking. Pick up the change once it lands.
	useEffect(() => {
		if (driveTimes.dataUpdatedAt) {
			void utils.clients.getOne.invalidate();
		}
	}, [driveTimes.dataUpdatedAt, utils]);

	return (
		<Popover onOpenChange={setEnabled}>
			<PopoverTrigger asChild>
				<span className="cursor-pointer font-normal text-muted-foreground hover:underline">
					(Compare)
				</span>
			</PopoverTrigger>
			<PopoverContent side="right">
				{driveTimes.isLoading ? (
					<div className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
						<Loader2Icon className="h-4 w-4 animate-spin" />
						Getting drive times from Waze
					</div>
				) : driveTimes.isError ? (
					<p className="p-3 text-destructive text-sm">
						Could not load drive times.
					</p>
				) : driveTimes.data && driveTimes.data.length > 0 ? (
					<ul className="list-disc p-3">
						{driveTimes.data.map((office) => (
							<li key={office.key}>
								<span className="font-bold">{office.prettyName}</span>:{" "}
								{office.durationMinutes != null && office.distanceMiles != null
									? `${office.distanceMiles.toFixed(0)} mi (${formatDriveTime(office.durationMinutes)})`
									: "unavailable"}
							</li>
						))}
					</ul>
				) : (
					<p className="p-3 text-muted-foreground text-sm">
						No drive times available.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
