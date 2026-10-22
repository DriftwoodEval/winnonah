"use client";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { AlertTriangleIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { ClientGetOneOutput } from "~/lib/api-types";
import {
	cn,
	formatClientAge,
	formatDateOnlyLong,
	formatPhoneNumber,
} from "~/lib/utils";
import { Redact } from "../redaction/Redact";
import { ManualAddressDialog } from "./location/ManualAddressDialog";
import { OfficeDriveTimesButton } from "./location/OfficeDriveTimesButton";
import { SelectHealthFormButton } from "./SelectHealthFormButton";

type Contact = ClientGetOneOutput["contacts"][number];

function ContactCard({ contact }: { contact: Contact }) {
	const name = [contact.firstName, contact.middleName, contact.lastName]
		.filter(Boolean)
		.join(" ");

	return (
		<div className="min-w-48 rounded-md border bg-background p-3 text-sm">
			<p className="font-semibold">
				<Redact>{name}</Redact>
				{contact.relationship && (
					<span className="font-normal"> ({contact.relationship})</span>
				)}
			</p>
			{contact.phone && (
				<Link className="block hover:underline" href={`tel:${contact.phone}`}>
					<Redact>{formatPhoneNumber(contact.phone)}</Redact>
				</Link>
			)}
		</div>
	);
}

interface ClientDetailsCardProps {
	client: ClientGetOneOutput;
	truncated?: boolean;
}

export function ClientDetailsCard({
	client,
	truncated = false,
}: ClientDetailsCardProps) {
	const can = useCheckPermission();

	return (
		<div className="flex w-full flex-wrap gap-6 rounded-md border-2 bg-card p-4 shadow-sm">
			{!truncated && (
				<div>
					<p className="font-bold">Date of Birth</p>
					<p>
						<Redact>{formatDateOnlyLong(client.dob)}</Redact>
					</p>
				</div>
			)}

			<div>
				<p className="font-bold">Age</p>
				<p>{client.dob ? formatClientAge(client.dob) : ""}</p>
			</div>

			{client.addedDate && !truncated && (
				<div>
					<p className="font-bold">Date of Entry</p>
					<p>{formatDateOnlyLong(client.addedDate)}</p>
				</div>
			)}

			{!client.privatePay ? (
				<div
					className={cn(
						"",
						(client.secondaryInsurance || client.precertExpires) &&
							"flex flex-wrap gap-3",
					)}
				>
					{client.primaryInsurance && (
						<div>
							<p className="font-bold">Primary Insurance</p>
							<p>
								{client.primaryInsurance
									.replace(/_/g, " ")
									.replace("MolinaMarketplace", "Molina Marketplace")}
							</p>
							{!truncated &&
								client.primaryInsurance
									.toLowerCase()
									.includes("select health") &&
								can("clients:pa-forms") && (
									<div className="mt-2">
										<SelectHealthFormButton clientId={client.id} />
									</div>
								)}
						</div>
					)}
					{client.secondaryInsurance &&
						client.secondaryInsurance.length > 0 && (
							<div>
								<p className="font-bold">Secondary Insurance</p>
								<p>
									{client.secondaryInsurance
										.map((s) => s.trim().replace(/_/g, " "))
										.join(", ")}
								</p>
							</div>
						)}
					{client.precertExpires && !truncated && (
						<div>
							<p className="font-bold">PA Expires</p>
							<p>{formatDateOnlyLong(client.precertExpires)}</p>
						</div>
					)}
				</div>
			) : (
				<div>
					<p className="font-bold">Payment Type</p>
					<p>Private Pay</p>
				</div>
			)}

			{!truncated && (
				<div>
					<p className="font-bold">Gender</p>
					<p>{client.gender ?? "Unknown"}</p>
				</div>
			)}

			{!truncated && (
				<div>
					<p className="font-bold">Address</p>
					{(client.address && (
						<Link
							className="hover:underline"
							href={`https://maps.google.com/?q=${encodeURIComponent(client.address)}`}
							target="_blank"
						>
							<Redact>{client.address}</Redact>
						</Link>
					)) || <p>Unknown</p>}
				</div>
			)}

			<div>
				<p className="font-bold">School District</p>
				<p>
					{(client.schoolDistrictDetails?.shortName ||
						client.schoolDistrict?.replace(/ (County )?School District/, "")) ??
						"Unknown"}
				</p>
			</div>

			{!truncated && (
				<div>
					<p className="font-bold">
						Closest Office{" "}
						{client.closestOffices.length > 0 && (
							<OfficeDriveTimesButton clientId={client.id} />
						)}
					</p>
					<p>
						{client.closestOffices[0]?.prettyName ?? "Unknown"}{" "}
						{client.closestOffices[0]?.distanceMiles
							? `(${client.closestOffices[0]?.distanceMiles.toFixed(0)} mi)`
							: ""}
					</p>
				</div>
			)}

			{client.phoneNumber && (
				<div>
					<p className="font-bold">Phone Number</p>
					<Link className="hover:underline" href={`tel:${client.phoneNumber}`}>
						<Redact>{formatPhoneNumber(client.phoneNumber)}</Redact>
					</Link>
				</div>
			)}

			{client.eiContact && (
				<div>
					<p className="font-bold">
						EI Contact{client.eiRemindersEnabled ? "" : " (reminders off)"}
					</p>
					<Link
						className="hover:underline"
						href={`tel:${client.eiContact.phoneNumber}`}
					>
						<Redact>
							{`${client.eiContact.name} — ${formatPhoneNumber(client.eiContact.phoneNumber)}`}
						</Redact>
					</Link>
				</div>
			)}

			{client.email && (
				<div>
					<p className="font-bold">Email</p>
					<Link className="hover:underline" href={`mailto:${client.email}`}>
						<Redact>{client.email}</Redact>
					</Link>
				</div>
			)}

			{!truncated && client.contacts.length > 0 && (
				<div className="w-full">
					<p className="font-bold">
						{client.contacts.length === 1 ? "Contact" : "Contacts"}
					</p>
					<div className="mt-1 flex flex-wrap gap-4">
						{client.contacts.map((contact) => (
							<ContactCard contact={contact} key={contact.id} />
						))}
					</div>
				</div>
			)}

			{(client.schoolDistrict === "Unknown" || !client.schoolDistrict) && (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>
						Unable to determine school district, double-check evaluators.
					</AlertTitle>
				</Alert>
			)}

			{client.flag === "poor_address_lookup" && (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>
						Poor address lookup for this client. Double check values and
						manually input.
					</AlertTitle>
					<AlertDescription>
						<ManualAddressDialog
							client={client}
							trigger={
								<Button className="cursor-pointer" size="sm" variant="outline">
									<MapPinIcon className="mr-2 h-4 w-4" />
									Manual Input
								</Button>
							}
						/>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
