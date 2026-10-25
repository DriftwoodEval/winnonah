"use client";

import { Badge } from "@ui/badge";
import type { ReactNode } from "react";
import {
	CLIENT_CARD_FIELDS,
	type ClientCardFieldId,
	type ClientCardSummary,
} from "~/lib/clients/client-card";
import { getHexFromColor, isClientColor } from "~/lib/colors";
import {
	formatClientAge,
	formatDateOnlyLong,
	formatInBusinessTime,
	formatPhoneNumber,
} from "~/lib/utils";
import { Redact } from "../redaction/Redact";

function formatInsurance(name: string) {
	return name
		.replace(/_/g, " ")
		.replace("MolinaMarketplace", "Molina Marketplace");
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span>{children}</span>
		</div>
	);
}

function renderField(id: ClientCardFieldId, client: ClientCardSummary) {
	const label =
		CLIENT_CARD_FIELDS.find((field) => field.id === id)?.label ?? id;

	switch (id) {
		case "age":
			return client.dob ? (
				<CardRow label={label}>{formatClientAge(client.dob)}</CardRow>
			) : null;
		case "dob":
			return (
				<CardRow label={label}>
					<Redact>{formatDateOnlyLong(client.dob)}</Redact>
				</CardRow>
			);
		case "gender":
			return <CardRow label={label}>{client.gender ?? "Unknown"}</CardRow>;
		case "language":
			return client.language ? (
				<CardRow label={label}>{client.language}</CardRow>
			) : null;
		case "asdAdhd":
			return client.asdAdhd ? (
				<CardRow label={label}>{client.asdAdhd}</CardRow>
			) : null;
		case "phone":
			return client.phoneNumber ? (
				<CardRow label={label}>
					<Redact>{formatPhoneNumber(client.phoneNumber)}</Redact>
				</CardRow>
			) : null;
		case "email":
			return client.email ? (
				<CardRow label={label}>
					<Redact>{client.email}</Redact>
				</CardRow>
			) : null;
		case "address":
			return client.address ? (
				<CardRow label={label}>
					<Redact>{client.address}</Redact>
				</CardRow>
			) : null;
		case "schoolDistrict":
			return client.schoolDistrict ? (
				<CardRow label={label}>{client.schoolDistrict}</CardRow>
			) : null;
		case "primaryInsurance":
			if (client.privatePay)
				return <CardRow label={label}>Private pay</CardRow>;
			return client.primaryInsurance ? (
				<CardRow label={label}>
					{formatInsurance(client.primaryInsurance)}
				</CardRow>
			) : null;
		case "secondaryInsurance":
			return client.secondaryInsurance?.length ? (
				<CardRow label={label}>
					{client.secondaryInsurance
						.map((s) => formatInsurance(s.trim()))
						.join(", ")}
				</CardRow>
			) : null;
		case "precertExpires":
			return client.precertExpires ? (
				<CardRow label={label}>
					{formatDateOnlyLong(client.precertExpires)}
				</CardRow>
			) : null;
		case "balance":
			return client.outstandingBalance > 0 ? (
				<CardRow label={label}>${client.outstandingBalance.toFixed(2)}</CardRow>
			) : null;
		case "name":
		case "colorDot":
		case "highPriority":
		case "paused":
		case "babyNet":
		case "autismStop":
		case "alreadyDx":
			return null;
		case "nextAppointment":
			return (
				<CardRow label={label}>
					{client.nextAppointment ? (
						<>
							{formatInBusinessTime(
								client.nextAppointment.startTime,
								"EEE, MMM d 'at' h:mm a",
							)}
							<span className="block text-muted-foreground text-xs">
								{[
									client.nextAppointment.evaluatorName,
									client.nextAppointment.officeName,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</>
					) : (
						"None scheduled"
					)}
				</CardRow>
			);
		case "pendingQuestionnaires":
			return (
				<CardRow label={label}>
					{client.pendingQuestionnaires > 0
						? client.pendingQuestionnaires
						: "None"}
				</CardRow>
			);
		case "addedDate":
			return client.addedDate ? (
				<CardRow label={label}>{formatDateOnlyLong(client.addedDate)}</CardRow>
			) : null;
	}
}

type Indicator = {
	id: ClientCardFieldId;
	label: string;
	variant: "destructive" | "warning" | "info" | "secondary";
	isSet: (client: ClientCardSummary) => boolean;
};

/** Status badges, in display order. */
const INDICATORS: Indicator[] = [
	{
		id: "highPriority",
		label: "High priority",
		variant: "destructive",
		isSet: (client) => client.highPriority,
	},
	{
		id: "paused",
		label: "Paused",
		variant: "warning",
		isSet: (client) => client.pause,
	},
	{
		id: "babyNet",
		label: "BabyNet",
		variant: "info",
		isSet: (client) => client.babyNet,
	},
	{
		id: "autismStop",
		label: "Autism stop",
		variant: "destructive",
		isSet: (client) => client.autismStop,
	},
	{
		id: "alreadyDx",
		label: "Already diagnosed",
		variant: "secondary",
		isSet: (client) => client.alreadyDx,
	},
];

/** The status badges for whichever indicator fields are selected, in one row. */
function renderIndicators(
	fields: ClientCardFieldId[],
	client: ClientCardSummary,
) {
	const active = INDICATORS.filter(
		(indicator) => fields.includes(indicator.id) && indicator.isSet(client),
	);
	if (active.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1">
			{active.map((indicator) => (
				<Badge key={indicator.id} variant={indicator.variant}>
					{indicator.label}
				</Badge>
			))}
		</div>
	);
}

interface ClientInfoCardProps {
	client: ClientCardSummary;
	fields: ClientCardFieldId[];
}

/** The body of the client hover card: the name plus whichever fields the user picked. */
export function ClientInfoCard({ client, fields }: ClientInfoCardProps) {
	// Fields with no value for this client render nothing, so skip them here
	// rather than leaving an empty gap in the card.
	const firstIndicator = fields.find((id) =>
		INDICATORS.some((indicator) => indicator.id === id),
	);
	const rows = fields
		.map((id) => ({
			id,
			content:
				id === firstIndicator
					? renderIndicators(fields, client)
					: renderField(id, client),
		}))
		.filter((row) => row.content);
	const showName = fields.includes("name");
	const showDot = fields.includes("colorDot") && isClientColor(client.color);
	const hasHeader = showName || showDot;

	return (
		<div className="flex flex-col gap-2">
			{hasHeader && (
				<p className="flex items-center gap-2 font-semibold">
					{showDot && isClientColor(client.color) && (
						<span
							className="h-3 w-3 shrink-0 rounded-full"
							style={{ backgroundColor: getHexFromColor(client.color) }}
						/>
					)}
					{showName && <Redact>{client.fullName}</Redact>}
				</p>
			)}
			{rows.length === 0 && !hasHeader ? (
				<p className="text-muted-foreground text-xs">
					Nothing to show for this client.
				</p>
			) : (
				rows.map((row) => <div key={row.id}>{row.content}</div>)
			)}
		</div>
	);
}
