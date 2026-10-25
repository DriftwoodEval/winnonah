"use client";

import { Redact } from "@components/redaction/Redact";
import { Badge } from "@ui/badge";
import { Separator } from "@ui/separator";
import { Fragment, type ReactNode } from "react";
import {
	CLIENT_CARD_FIELDS,
	type ClientCardAppointment,
	type ClientCardFieldId,
	type ClientCardSummary,
} from "~/lib/clients/client-card";
import { getHexFromColor, isClientColor } from "~/lib/colors";
import {
	formatClientAge,
	formatCurrency,
	formatDateOnlyLong,
	formatInBusinessTime,
	formatPhoneNumber,
	isNotesOnlyClientId,
} from "~/lib/utils";

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

function AppointmentSummary({
	appointment,
}: {
	appointment: ClientCardAppointment | null;
}) {
	if (!appointment) return "None scheduled";
	return (
		<>
			{formatInBusinessTime(appointment.startTime, "EEE, MMM d 'at' h:mm a")}
			<span className="block text-muted-foreground text-xs">
				{[appointment.evaluatorName, appointment.officeName]
					.filter(Boolean)
					.join(" · ")}
			</span>
		</>
	);
}

function renderField(id: ClientCardFieldId, client: ClientCardSummary) {
	const label =
		CLIENT_CARD_FIELDS.find((field) => field.id === id)?.label ?? id;

	switch (id) {
		case "dob":
			return (
				<CardRow label={label}>
					<Redact>{formatDateOnlyLong(client.dob)}</Redact>
				</CardRow>
			);
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
		case "name":
		case "colorDot":
		case "age":
		case "gender":
		case "language":
		case "asdAdhd":
		case "balance":
		case "clientId":
		case "status":
		case "dashboardStatus":
		case "highPriority":
		case "paused":
		case "babyNet":
		case "autismStop":
		case "alreadyDx":
			return null;
		case "nextAppointment":
			return (
				<CardRow label={label}>
					<AppointmentSummary appointment={client.nextAppointment} />
				</CardRow>
			);
		case "lastAppointment":
			return client.lastAppointment ? (
				<CardRow label={label}>
					<AppointmentSummary appointment={client.lastAppointment} />
				</CardRow>
			) : null;
		case "assignedEvaluators":
			return client.assignedEvaluators.length ? (
				<CardRow label={label}>{client.assignedEvaluators.join(", ")}</CardRow>
			) : null;
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

/** The client ID and Active/Inactive badge, as in the client header. */
function renderIdentity(
	fields: ClientCardFieldId[],
	client: ClientCardSummary,
) {
	const notesOnly = isNotesOnlyClientId(client.id);
	const showId = fields.includes("clientId") && !notesOnly;
	const showStatus = fields.includes("status");
	if (!showId && !showStatus) return null;
	return (
		<div className="flex items-center gap-2">
			{showId && (
				<span>
					<Redact>{String(client.id)}</Redact>
				</span>
			)}
			{showStatus && (
				<Badge
					variant={
						notesOnly ? "outline" : client.status ? "default" : "destructive"
					}
				>
					{notesOnly
						? `Notes Only${client.status ? "" : ", Archived"}`
						: client.status
							? "Active"
							: "Inactive"}
				</Badge>
			)}
		</div>
	);
}

/** Dashboard sections the client is in, as badges. */
function renderDashboardStatus(
	fields: ClientCardFieldId[],
	client: ClientCardSummary,
) {
	if (!fields.includes("dashboardStatus") || !client.dashboardSections.length)
		return null;
	return (
		<div className="flex flex-wrap gap-1">
			{client.dashboardSections.map((section) => (
				<Badge key={section} variant="secondary">
					{section}
				</Badge>
			))}
		</div>
	);
}

/** Short facts shown on one line under the name, like the client header. */
function renderInlineFacts(
	fields: ClientCardFieldId[],
	client: ClientCardSummary,
) {
	const facts: { id: ClientCardFieldId; content: ReactNode }[] = [
		{ id: "age", content: client.dob && formatClientAge(client.dob) },
		{ id: "gender", content: client.gender },
		{
			id: "language",
			content: client.language && (
				<span className={client.language === "English" ? "" : "font-bold"}>
					{client.language}
				</span>
			),
		},
		{ id: "asdAdhd", content: client.asdAdhd },
	];
	const shown = facts.filter(
		(fact) => fields.includes(fact.id) && fact.content,
	);
	if (shown.length === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
			{shown.map((fact, index) => (
				<Fragment key={fact.id}>
					{index > 0 && <Separator className="h-4" orientation="vertical" />}
					<span>{fact.content}</span>
				</Fragment>
			))}
		</div>
	);
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

/** The status badges (and balance due) for whichever fields are selected, in one row. */
function renderIndicators(
	fields: ClientCardFieldId[],
	client: ClientCardSummary,
) {
	const active = INDICATORS.filter(
		(indicator) => fields.includes(indicator.id) && indicator.isSet(client),
	);
	const showBalance =
		fields.includes("balance") && client.outstandingBalance > 0;
	if (active.length === 0 && !showBalance) return null;
	return (
		<div className="flex flex-wrap gap-1">
			{active.map((indicator) => (
				<Badge key={indicator.id} variant={indicator.variant}>
					{indicator.label}
				</Badge>
			))}
			{showBalance && (
				<Badge variant="destructive">
					{formatCurrency(client.outstandingBalance)} due
				</Badge>
			)}
		</div>
	);
}

interface ClientInfoCardProps {
	client: ClientCardSummary;
	fields: ClientCardFieldId[];
}

/** The body of the client hover card: the name plus whichever fields the user picked. */
export function ClientInfoCard({ client, fields }: ClientInfoCardProps) {
	// Fields with no value render nothing, so skip them here rather than
	// leaving an empty gap in the card.
	const rows = fields
		.map((id) => ({ id, content: renderField(id, client) }))
		.filter((row) => row.content);
	const identity = renderIdentity(fields, client);
	const badges = renderIndicators(fields, client);
	const dashboard = renderDashboardStatus(fields, client);
	const facts = renderInlineFacts(fields, client);
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
			{identity}
			{badges}
			{dashboard}
			{facts}
			{rows.length === 0 &&
			!hasHeader &&
			!identity &&
			!badges &&
			!dashboard &&
			!facts ? (
				<p className="text-muted-foreground text-xs">
					Nothing to show for this client.
				</p>
			) : (
				rows.map((row) => <div key={row.id}>{row.content}</div>)
			)}
		</div>
	);
}
