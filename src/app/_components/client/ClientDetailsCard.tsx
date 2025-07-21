"use client";
import { Alert, AlertTitle } from "@components/ui/alert";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@components/ui/popover";
import { AlertTriangleIcon } from "lucide-react";
import { cn, formatClientAge } from "~/lib/utils";
import type { Offices } from "~/server/api/routers/database";
import type { Client } from "~/server/lib/types";

interface ClientDetailsCardProps {
	client: Client;
	offices: Offices | undefined;
}

export function ClientDetailsCard({ client, offices }: ClientDetailsCardProps) {
	const closestOffice = offices?.[client.closestOffice ?? ""] ?? null;
	const secondClosestOffice =
		offices?.[client.secondClosestOffice ?? ""] ?? null;
	const thirdClosestOffice = offices?.[client.thirdClosestOffice ?? ""] ?? null;

	return (
		<div className="flex w-[calc(100vw-32px)] flex-wrap gap-6 rounded-md border-2 bg-card p-4 shadow sm:w-4xl">
			<div>
				<p className="font-bold">Date of Birth</p>
				<p>{client.dob?.toLocaleDateString("en-US")}</p>
			</div>

			<div>
				<p className="font-bold">Age</p>
				<p>{client.dob ? formatClientAge(client.dob) : ""}</p>
			</div>

			{client.addedDate && (
				<div>
					<p className="font-bold">Date of Entry</p>
					<p>{client.addedDate?.toLocaleDateString("en-US")}</p>
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
							<p>{client.secondaryInsurance.replace(/_/g, " ")}</p>
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
				<p>{client.address}</p>
			</div>

			<div>
				<p className="font-bold">School District</p>
				<p>{client.schoolDistrict}</p>
			</div>

			<div>
				<p className="font-bold">
					Closest Office{" "}
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
				</p>
				<p>
					{closestOffice?.prettyName} ({client.closestOfficeMiles} mi)
				</p>
			</div>

			{client.schoolDistrict === "Unknown" && (
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
