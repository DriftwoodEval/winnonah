"use client";

import { Badge } from "@ui/badge";
import { Armchair } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPhoneNumber, normalizePhoneNumber } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { RecentMessagesPopover } from "./RecentMessagesPopover";

export type RecentMessagesMap = RouterOutputs["quo"]["getRecentMessages"];
export type GreeterSchedule = RouterOutputs["greeterProxy"]["getSchedule"];

export function findGreeter(
	schedule: GreeterSchedule | undefined,
	officeName: string | null | undefined,
) {
	if (!schedule || !officeName) return null;
	const norm = officeName.trim().toLowerCase();
	const match = schedule.find((entry) => {
		const loc = entry.location.trim().toLowerCase();
		return loc === norm || loc.includes(norm) || norm.includes(loc);
	});
	return match ?? null;
}

/** Collects the distinct client phone numbers off a list of appointments. */
export function collectPhoneNumbers(
	appts: { clientPhone: string | null }[],
): string[] {
	return [
		...new Set(appts.map((a) => a.clientPhone).filter((p): p is string => !!p)),
	];
}

type Greeter = { name: string; phone: string | null };

/** Block variant: greeter shown above a day's appointment list. */
export function GreeterLine({ greeter }: { greeter: Greeter | null }) {
	if (!greeter) return null;
	return (
		<div className="mb-2 flex items-center gap-1.5 border-b pb-2 text-xs">
			<span className="text-muted-foreground">Greeter:</span>
			<span className="font-medium">
				<Redact>{greeter.name}</Redact>
			</span>
			{greeter.phone && (
				<a
					className="text-secondary hover:underline"
					href={`tel:${greeter.phone}`}
				>
					<Redact>{formatPhoneNumber(greeter.phone)}</Redact>
				</a>
			)}
		</div>
	);
}

/** Inline variant: greeter shown next to an office header. */
export function GreeterInline({ greeter }: { greeter: Greeter | null }) {
	if (!greeter) return null;
	return (
		<span className="shrink-0 text-muted-foreground text-xs normal-case">
			<Redact>{greeter.name}</Redact>
			{greeter.phone && (
				<>
					{" · "}
					<a
						className="text-secondary hover:underline"
						href={`tel:${greeter.phone}`}
					>
						<Redact>{formatPhoneNumber(greeter.phone)}</Redact>
					</a>
				</>
			)}
		</span>
	);
}

/**
 * Asd/Adhd and Da/Eval type badges. `className` lets each surface's row
 * component control sizing (widget rows run smaller than page rows).
 */
export function ApptTypeBadges({
	appt,
	className = "shrink-0",
}: {
	appt: { asdAdhd: string | null; daEval: string | null };
	className?: string;
}) {
	return (
		<>
			{appt.asdAdhd && (
				<Badge className={className} variant="outline">
					{appt.asdAdhd}
				</Badge>
			)}
			{appt.daEval && (
				<Badge className={className} variant="outline">
					{appt.daEval}
				</Badge>
			)}
		</>
	);
}

/**
 * Confirmed/Unconfirmed badge. Widget rows show an explicit "Unconfirmed"
 * state; page rows just omit the badge when unconfirmed.
 */
export function ConfirmedBadge({
	confirmedAt,
	showUnconfirmed = false,
}: {
	confirmedAt: Date | null;
	showUnconfirmed?: boolean;
}) {
	if (confirmedAt) {
		return (
			<Badge className="h-4 shrink-0 px-1 text-[9px] uppercase">
				Confirmed
			</Badge>
		);
	}
	if (!showUnconfirmed) return null;
	return (
		<Badge
			className="h-4 shrink-0 px-1 text-[9px] uppercase"
			variant="destructive"
		>
			Unconfirmed
		</Badge>
	);
}

/** Wires an appointment's client phone number up to the messages popover. */
export function ApptMessagesPopover({
	appt,
	messages,
	messagesLoading,
	className,
	onOpenChange,
}: {
	appt: { startTime: Date; clientPhone?: string | null };
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	className?: string;
	onOpenChange?: (open: boolean) => void;
}) {
	return (
		<RecentMessagesPopover
			appointmentStart={appt.startTime}
			className={className}
			isLoading={messagesLoading}
			messages={
				appt.clientPhone
					? messages[normalizePhoneNumber(appt.clientPhone)]
					: undefined
			}
			onOpenChange={onOpenChange}
			phoneNumber={appt.clientPhone}
		/>
	);
}

/** Google Drive and TherapyAppointment portal links for a client. */
export function ClientPortalLinks({
	driveId,
	taHash,
	size = 14,
}: {
	driveId?: string | null;
	taHash?: string | null;
	size?: number;
}) {
	return (
		<>
			{driveId && driveId !== "N/A" && (
				<Link
					className="shrink-0"
					href={`https://drive.google.com/open?id=${driveId}`}
					target="_blank"
				>
					<Image
						alt="Google Drive"
						className="dark:invert"
						height={size}
						src="/icons/google-drive.svg"
						width={size}
					/>
				</Link>
			)}
			{taHash && (
				<Link
					className="shrink-0 text-muted-foreground hover:text-foreground"
					href={`https://api.portal.therapyappointment.com/n/client/${taHash}`}
					target="_blank"
				>
					<Armchair height={size} width={size} />
				</Link>
			)}
		</>
	);
}
