"use client";
import { Alert, AlertTitle } from "@ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { AlertTriangleIcon } from "lucide-react";
import { cn, formatClientAge } from "~/lib/utils";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";

interface ClientDetailsCardProps {
	client: Client;
}

export function ClientDetailsCard({ client }: ClientDetailsCardProps) {
	const { data: closestOffice } = api.offices.getOne.useQuery(
		{
			column: "key",
			value: client.closestOffice ?? "",
		},
		{
			enabled: !!client.closestOffice,
		},
	);
	const { data: secondClosestOffice } = api.offices.getOne.useQuery(
		{
			column: "key",
			value: client.secondClosestOffice ?? "",
		},
		{
			enabled: !!client.secondClosestOffice,
		},
	);
	const { data: thirdClosestOffice } = api.offices.getOne.useQuery(
		{
			column: "key",
			value: client.thirdClosestOffice ?? "",
		},
		{ enabled: !!client.thirdClosestOffice },
	);

	return (
		<div className="flex w-full flex-wrap gap-6 rounded-md border-2 bg-card p-4 shadow">
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

			<div>
				<p className="font-bold">Age</p>
				<p>{client.dob ? formatClientAge(client.dob) : ""}</p>
			</div>

			{client.addedDate && (
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
						client.secondaryInsurance && "flex flex-wrap gap-3 rounded-md",
					)}
				>
					{client.primaryInsurance && (
						<div>
							<p className="font-bold">Primary Insurance</p>
							<p>{client.primaryInsurance.replace(/_/g, " ")}</p>
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
				</div>
			) : (
				<div>
					<p className="font-bold">Payment Type</p>
					<p>Private Pay</p>
				</div>
			)}

			<div>
				<p className="font-bold">Address</p>
				<p>{client.address ?? "Unknown"}</p>
			</div>

			<div>
				<p className="font-bold">School District</p>
				<p>{client.schoolDistrict ?? "Unknown"}</p>
			</div>

			<div>
				<p className="font-bold">
					Closest Office{" "}
					{(secondClosestOffice || thirdClosestOffice) && (
						<Popover>
							<PopoverTrigger asChild>
								<span className="cursor-pointer font-normal text-muted-foreground underline">
									(Compare)
								</span>
							</PopoverTrigger>
							<PopoverContent side="right">
								<ul className="list-disc p-3">
									<li>
										{secondClosestOffice?.prettyName} (
										{client.secondClosestOfficeMiles} mi)
									</li>
									<li>
										{thirdClosestOffice?.prettyName} (
										{client.thirdClosestOfficeMiles} mi)
									</li>
								</ul>
							</PopoverContent>
						</Popover>
					)}
				</p>
				<p>
					{closestOffice?.prettyName ?? "Unknown"}{" "}
					{client.closestOfficeMiles ? `(${client.closestOfficeMiles} mi)` : ""}
				</p>
			</div>

			{(client.schoolDistrict === "Unknown" || !client.schoolDistrict) && (
				<Alert variant="destructive">
					<AlertTriangleIcon />
					<AlertTitle>
						Unable to determine school district, double-check evaluators.
					</AlertTitle>
				</Alert>
			)}
		</div>
	);
}
