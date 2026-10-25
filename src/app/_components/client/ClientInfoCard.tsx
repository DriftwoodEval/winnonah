"use client";

import { Badge } from "@ui/badge";
import type { ReactNode } from "react";
import {
	CLIENT_CARD_FIELDS,
	type ClientCardFieldId,
	type ClientCardSummary,
} from "~/lib/clients/client-card";
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
		case "flags": {
			const flags = [
				client.highPriority && "High priority",
				client.babyNet && "BabyNet",
				client.pause && "Paused",
				client.autismStop && "Autism stop",
			].filter((flag): flag is string => !!flag);
			return flags.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{flags.map((flag) => (
						<Badge key={flag} variant="secondary">
							{flag}
						</Badge>
					))}
				</div>
			) : null;
		}
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

interface ClientInfoCardProps {
	client: ClientCardSummary;
	fields: ClientCardFieldId[];
}

/** The body of the client hover card: the name plus whichever fields the user picked. */
export function ClientInfoCard({ client, fields }: ClientInfoCardProps) {
	// Fields with no value for this client render nothing, so skip them here
	// rather than leaving an empty gap in the card.
	const rows = fields
		.map((id) => ({ id, content: renderField(id, client) }))
		.filter((row) => row.content);

	return (
		<div className="flex flex-col gap-2">
			<p className="font-semibold">
				<Redact>{client.fullName}</Redact>
			</p>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					Nothing to show for this client.
				</p>
			) : (
				rows.map((row) => <div key={row.id}>{row.content}</div>)
			)}
		</div>
	);
}
