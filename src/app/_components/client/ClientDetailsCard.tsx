"use client";
import { Alert, AlertTitle } from "@ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import type { ClientWithOffice } from "~/lib/types";
import { cn, formatClientAge, formatPhoneNumber } from "~/lib/utils";

interface ClientDetailsCardProps {
	client: ClientWithOffice;
	truncated?: boolean;
}

export function ClientDetailsCard({
	client,
	truncated = false,
}: ClientDetailsCardProps) {
	return (
		<div className="flex w-full flex-wrap gap-6 rounded-md border-2 bg-card p-4 shadow">
			{!truncated && (
				<div>
					<p className="font-bold">Date of Birth</p>
					<p>
						{client.dob?.toLocaleDateString("en-US", {
							year: "numeric",
							month: "numeric",
							day: "numeric",
							timeZone: "UTC",
						})}
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
					<p>
						{client.addedDate?.toLocaleDateString("en-US", {
							year: "numeric",
							month: "numeric",
							day: "numeric",
							timeZone: "UTC",
						})}
					</p>
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
						</div>
					)}
					{client.secondaryInsurance && (
						<div>
							<p className="font-bold">Secondary Insurance</p>
							<p>
								{client.secondaryInsurance
									.split(",")
									.map((s) => s.trim().replace(/_/g, " "))
									.join(", ")}
							</p>
						</div>
					)}
					{client.precertExpires && !truncated && (
						<div>
							<p className="font-bold">PA Expires</p>
							<p>
								{client.precertExpires?.toLocaleDateString("en-US", {
									year: "numeric",
									month: "numeric",
									day: "numeric",
									timeZone: "UTC",
								})}
							</p>
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
							{client.address}
						</Link>
					)) || <p>Unknown</p>}
				</div>
			)}

			<div>
				<p className="font-bold">School District</p>
				<p>
					{(client.schoolDistrictDetails?.shortName ||
						client.schoolDistrict
							?.replace(/ County School District/, "")
							.replace(/ School District/, "")) ??
						"Unknown"}
				</p>
			</div>

			{!truncated && (
				<div>
					<p className="font-bold">
						Closest Office{" "}
						<Popover>
							<PopoverTrigger asChild>
								<span className="cursor-pointer font-normal text-muted-foreground hover:underline">
									(Compare)
								</span>
							</PopoverTrigger>
							<PopoverContent side="right">
								<ul className="list-disc p-3">
									{client.closestOffices.slice(1).map((office, i) => (
										<li key={`${office.key}-${i}`}>
											{office.prettyName} ({office.distanceMiles.toFixed(0)} mi)
										</li>
									))}
								</ul>
							</PopoverContent>
						</Popover>
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
						{formatPhoneNumber(client.phoneNumber)}
					</Link>
				</div>
			)}

			{client.email && (
				<div>
					<p className="font-bold">Email</p>
					<Link className="hover:underline" href={`mailto:${client.email}`}>
						{client.email}
					</Link>
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

			{client.flag === "district_from_shapefile" && (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>
						School district was found after cutting address, confirm that it's
						correct by editing the client and submitting.
					</AlertTitle>
				</Alert>
			)}
		</div>
	);
}
