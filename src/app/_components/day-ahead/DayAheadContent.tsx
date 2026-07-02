"use client";

import { Badge } from "@ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { DatePicker } from "@ui/date-picker";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Armchair, ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { api } from "~/trpc/react";

const IS_DEV = process.env.NODE_ENV === "development";

function formatTime(date: Date) {
	return new Date(date).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

type Appointment = {
	id: string;
	startTime: Date;
	endTime: Date;
	daEval: string | null;
	asdAdhd: string | null;
	clientName: string;
	clientHash: string;
	clientDriveId?: string | null;
	clientTaHash?: string | null;
	officeName?: string | null;
	confirmedAt?: Date | null;
	calendarEventTitle?: string | null;
};

function AppointmentRow({ appt }: { appt: Appointment }) {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className="w-36 shrink-0 text-muted-foreground text-sm tabular-nums">
				{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
			</span>
			<Link
				className="truncate font-medium hover:text-secondary"
				href={`/clients/${appt.clientHash}`}
			>
				{appt.clientName}
			</Link>
			{appt.clientDriveId && appt.clientDriveId !== "N/A" && (
				<Link
					className="shrink-0"
					href={`https://drive.google.com/open?id=${appt.clientDriveId}`}
					target="_blank"
				>
					<Image
						alt="Google Drive"
						className="dark:invert"
						height={14}
						src="/icons/google-drive.svg"
						width={14}
					/>
				</Link>
			)}
			{appt.clientTaHash && (
				<Link
					className="shrink-0 text-muted-foreground hover:text-foreground"
					href={`https://api.portal.therapyappointment.com/n/client/${appt.clientTaHash}`}
					target="_blank"
				>
					<Armchair height="14" width="14" />
				</Link>
			)}
			{appt.asdAdhd && (
				<Badge className="shrink-0" variant="outline">
					{appt.asdAdhd}
				</Badge>
			)}
			{appt.daEval && (
				<Badge className="shrink-0" variant="outline">
					{appt.daEval}
				</Badge>
			)}
			{appt.officeName && (
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{appt.officeName}
				</span>
			)}
		</div>
	);
}

type EvaluatorAppt = {
	id: string;
	startTime: Date;
	endTime: Date;
	daEval: string | null;
	asdAdhd: string | null;
	clientName: string;
	clientHash: string;
	clientDriveId: string | null;
	clientTaHash: string | null;
};

function EvaluatorRow({
	evaluator,
}: {
	evaluator: {
		name: string;
		npi: number;
		isCurrentUser: boolean;
		appointments: EvaluatorAppt[];
	};
}) {
	const [open, setOpen] = useState(false);

	const first = evaluator.appointments[0];
	const last = evaluator.appointments[evaluator.appointments.length - 1];
	const timeRange =
		first && last
			? `${formatTime(first.startTime)} – ${formatTime(last.endTime)}`
			: null;

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left hover:opacity-80">
				{open ? (
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				)}
				<span className={evaluator.isCurrentUser ? "font-semibold" : ""}>
					{evaluator.name}
				</span>
				<span className="text-muted-foreground text-xs">
					{evaluator.appointments.length} appt
					{evaluator.appointments.length !== 1 ? "s" : ""}
				</span>
				{timeRange && (
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{timeRange}
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="ml-8 border-border border-l pl-4">
					{evaluator.appointments.map((appt) => (
						<div className="flex items-center gap-3 py-1.5" key={appt.id}>
							<span className="w-32 shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="truncate text-sm hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								{appt.clientName}
							</Link>
							{appt.clientDriveId && appt.clientDriveId !== "N/A" && (
								<Link
									className="shrink-0"
									href={`https://drive.google.com/open?id=${appt.clientDriveId}`}
									target="_blank"
								>
									<Image
										alt="Google Drive"
										className="dark:invert"
										height={12}
										src="/icons/google-drive.svg"
										width={12}
									/>
								</Link>
							)}
							{appt.clientTaHash && (
								<Link
									className="shrink-0 text-muted-foreground hover:text-foreground"
									href={`https://api.portal.therapyappointment.com/n/client/${appt.clientTaHash}`}
									target="_blank"
								>
									<Armchair height="12" width="12" />
								</Link>
							)}
							{appt.asdAdhd && (
								<Badge className="shrink-0 text-xs" variant="outline">
									{appt.asdAdhd}
								</Badge>
							)}
							{appt.daEval && (
								<Badge className="shrink-0 text-xs" variant="outline">
									{appt.daEval}
								</Badge>
							)}
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function DevControls({
	asUserId,
	onUserChange,
	asDate,
	onDateChange,
}: {
	asUserId: string | undefined;
	onUserChange: (id: string | undefined) => void;
	asDate: string;
	onDateChange: (date: string) => void;
}) {
	const { data: users } = api.users.getAll.useQuery();
	const dateValue = asDate ? new Date(`${asDate}T12:00:00`) : undefined;
	return (
		<div className="flex items-center gap-2">
			<DatePicker
				date={dateValue}
				id="dev-date"
				setDate={(d) =>
					onDateChange(
						d
							? d.toISOString().slice(0, 10)
							: new Date().toISOString().slice(0, 10),
					)
				}
			/>
			<Select
				onValueChange={(v) => onUserChange(v === "__self" ? undefined : v)}
				value={asUserId ?? "__self"}
			>
				<SelectTrigger className="h-7 w-48 text-xs">
					<SelectValue placeholder="View as..." />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="__self">Myself</SelectItem>
					{users?.map((u) => (
						<SelectItem key={u.id} value={u.id}>
							{u.name ?? u.email}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function DayAheadContent() {
	const [asUserId, setAsUserId] = useState<string | undefined>(undefined);
	const [asDate, setAsDate] = useState(() =>
		new Date().toISOString().slice(0, 10),
	);

	const input =
		(asUserId ?? (IS_DEV && asDate !== new Date().toISOString().slice(0, 10)))
			? { asUserId, asDate: IS_DEV ? asDate : undefined }
			: undefined;

	const { data, isLoading } = api.appointments.getDayAhead.useQuery(input);

	if (isLoading) {
		return <div className="p-6 text-muted-foreground text-sm">Loading...</div>;
	}

	if (!data) return null;

	const displayDate =
		IS_DEV && asDate
			? new Date(`${asDate}T12:00:00`).toLocaleDateString([], {
					weekday: "long",
					month: "long",
					day: "numeric",
				})
			: new Date().toLocaleDateString([], {
					weekday: "long",
					month: "long",
					day: "numeric",
				});

	const myFirst = data.myAppointments[0];
	const myLast = data.myAppointments[data.myAppointments.length - 1];
	const myTimeRange =
		myFirst && myLast
			? `${formatTime(myFirst.startTime)} – ${formatTime(myLast.endTime)}`
			: null;

	const otherOffices = data.offices
		.map((office) => ({
			...office,
			evaluators: office.evaluators.filter((ev) => !ev.isCurrentUser),
		}))
		.filter((office) => office.evaluators.length > 0)
		.sort((a, b) => (a.officeName ?? "").localeCompare(b.officeName ?? ""));

	return (
		<div className="flex h-full flex-col gap-6 overflow-auto p-6">
			<div className="flex items-center gap-4">
				<h1 className="font-semibold text-xl">{displayDate}</h1>
				{IS_DEV && (
					<DevControls
						asDate={asDate}
						asUserId={asUserId}
						onDateChange={setAsDate}
						onUserChange={setAsUserId}
					/>
				)}
			</div>

			{/* My agenda */}
			<section>
				<div className="mb-3 flex items-center gap-3">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Your Day
					</h2>
					{myTimeRange && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{myTimeRange}
						</span>
					)}
				</div>
				{!data.hasEvaluatorAccount ? (
					<p className="text-muted-foreground text-sm">
						Your account is not linked to an evaluator profile.
					</p>
				) : data.myAppointments.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No appointments scheduled for today.
					</p>
				) : (
					<div className="divide-y divide-border">
						{data.myAppointments.map((appt) => (
							<AppointmentRow appt={appt} key={appt.id} />
						))}
					</div>
				)}
			</section>

			<Separator />

			{/* Office view */}
			<section>
				<h2 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Who&apos;s In
				</h2>
				{otherOffices.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No one else has appointments today.
					</p>
				) : (
					<div className="flex flex-col gap-6">
						{otherOffices.map((office) => (
							<div key={office.locationKey}>
								<h3 className="mb-2 font-medium">{office.officeName}</h3>
								<div className="flex flex-col">
									{office.evaluators.map((ev) => (
										<EvaluatorRow evaluator={ev} key={ev.npi} />
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
