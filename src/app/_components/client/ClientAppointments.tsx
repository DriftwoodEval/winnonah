"use client";

import { Badge } from "@ui/badge";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import { CalendarIcon, Clock, MapPin, User } from "lucide-react";
import { getLocalTimeFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";

export function ClientAppointments({ clientId }: { clientId: number }) {
	const { data: appointments, isLoading } =
		api.appointments.getByClientId.useQuery({
			clientId,
		});

	if (isLoading) return <Skeleton className="h-64 w-full rounded-md" />;
	if (!appointments?.length) return null;

	return (
		<div className="flex max-h-80 w-full flex-col rounded-md border bg-background shadow-sm">
			<div className="sticky top-0 z-10 flex items-center justify-between bg-background px-4 pt-4">
				<h4 className="font-bold">Appointments</h4>
				<Badge className="h-5 px-1.5 font-mono text-[10px]" variant="outline">
					{appointments.length}
				</Badge>
			</div>

			<ScrollArea className="flex-1">
				<div className="flex flex-col">
					{appointments.map((appt, index) => {
						const startTime = getLocalTimeFromUTCDate(appt.startTime);
						const endTime = getLocalTimeFromUTCDate(appt.endTime);
						if (!startTime || !endTime) return null;

						const isDimmed = appt.cancelled || appt.placeholder;

						return (
							<div key={appt.id}>
								<div
									className={`p-3 transition-colors ${isDimmed ? "opacity-60" : ""}`}
								>
									<div className="mb-1.5 flex items-center justify-between">
										<div className="flex items-center gap-2 font-semibold text-sm">
											<CalendarIcon className="h-3.5 w-3.5" />
											{format(startTime, "MMM d, yyyy")}
											<div className="flex gap-1">
												{appt.cancelled && (
													<Badge
														className="h-4 px-1 text-[9px] uppercase"
														variant="destructive"
													>
														Cancelled
													</Badge>
												)}
												{appt.placeholder && (
													<Badge
														className="h-4 px-1 text-[9px] uppercase"
														variant="secondary"
													>
														Placceholder
													</Badge>
												)}
											</div>
										</div>
										<div className="flex items-center gap-1 text-muted-foreground text-sm">
											<Clock className="h-3 w-3" />
											{format(startTime, "p")} - {format(endTime, "p")}
										</div>
									</div>

									<div className="space-y-1.5">
										<div className="flex items-center gap-2 text-sm">
											<User className="h-3.5 w-3.5 text-muted-foreground" />
											<span>{appt.evaluatorName}</span>
										</div>

										<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
											<div className="flex items-center gap-1">
												<MapPin className="h-3 w-3" />
												<span className="max-w-[120px] truncate">
													{appt.locationKey ?? "No location"}
												</span>
											</div>

											{appt.daEval && (
												<span className="uppercase">{appt.daEval}</span>
											)}

											{appt.cpt && <span>CPT: {appt.cpt}</span>}
										</div>
									</div>
								</div>
								{index !== appointments.length - 1 && <Separator />}
							</div>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
}
