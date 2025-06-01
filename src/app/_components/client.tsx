"use client";

import { AlertTriangleIcon } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/app/_components/ui/popover";
import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { Skeleton } from "~/app/_components/ui/skeleton";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Alert, AlertTitle } from "./ui/alert";

export function Client({ hash }: { hash: string }) {
	const officeResponse = api.offices.getAll.useQuery();
	const offices = officeResponse.data;
	const clientResponse = api.clients.getOne.useQuery({
		column: "hash",
		value: hash,
	});
	const client = clientResponse.data;

	const eligibleEvaluatorsResponse =
		api.evaluators.getEligibleForClient.useQuery(client?.id ?? 0);
	const eligibleEvaluators = eligibleEvaluatorsResponse.data;

	if (clientResponse.error) {
		return <div>{clientResponse.error.message}</div>;
	}

	const closestOffice = offices?.[client?.closestOffice ?? ""] ?? null;
	const secondClosestOffice =
		offices?.[client?.secondClosestOffice ?? ""] ?? null;
	const thirdClosestOffice =
		offices?.[client?.thirdClosestOffice ?? ""] ?? null;

	const closestOfficeMiles = client?.closestOfficeMiles ?? null;
	const secondClosestOfficeMiles = client?.secondClosestOfficeMiles ?? null;
	const thirdClosestOfficeMiles = client?.thirdClosestOfficeMiles ?? null;
	return (
		<div className="mx-10 flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				{client ? (
					<h1 className="font-bold text-2xl">{client?.fullName}</h1>
				) : (
					<Skeleton className="h-6 w-36 rounded-md" />
				)}
				<div className="flex h-5 items-center gap-2">
					<span>{client?.id}</span>
					{client?.interpreter && <Separator orientation="vertical" />}
					{client?.interpreter && (
						<span className="font-bold">Interpreter Needed</span>
					)}
					{client?.asdAdhd && <Separator orientation="vertical" />}
					{client?.asdAdhd === "Both" ? (
						<span>ASD + ADHD</span>
					) : (
						<span>{client?.asdAdhd}</span>
					)}
				</div>
			</div>
			{client ? (
				<div className="flex max-w-3xl flex-wrap gap-6 rounded-md border-2 bg-card p-4">
					<div>
						<p className="font-bold">Date of Birth</p>
						<p>{client?.dob?.toLocaleDateString("en-US")}</p>
					</div>
					<div>
						<p className="font-bold">Age</p>
						<p>
							{client?.dob
								? (() => {
										const ageInMilliseconds =
											new Date().getTime() - client.dob.getTime();
										const years = Math.floor(
											ageInMilliseconds / (1000 * 60 * 60 * 24 * 365.25),
										);
										const months = Math.floor(
											(ageInMilliseconds % (1000 * 60 * 60 * 24 * 365.25)) /
												(1000 * 60 * 60 * 24 * 30.44),
										);
										return years < 3
											? `${years} years, ${months} months`
											: `${years} years`;
									})()
								: ""}
						</p>
					</div>
					<div>
						<p className="font-bold">Date of Entry</p>
						<p>{client?.addedDate.toLocaleDateString("en-US")}</p>
					</div>
					{!client?.privatePay && (
						<div
							className={cn(
								"",
								client?.secondaryInsurance && "flex flex-wrap gap-3 rounded-md",
							)}
						>
							{client?.primaryInsurance && (
								<div>
									<p className="font-bold">Primary Insurance</p>
									<p>{client.primaryInsurance.replace(/_/g, " ")}</p>
								</div>
							)}
							{client?.secondaryInsurance && (
								<div>
									<p className="font-bold">Secondary Insurance</p>
									<p>{client.secondaryInsurance.replace(/_/g, " ")}</p>
								</div>
							)}
						</div>
					)}
					{client?.privatePay && (
						<div>
							<p className="font-bold">Payment Type</p>
							<p>Private Pay</p>
						</div>
					)}
					<div>
						<p className="font-bold">Address</p>
						<p>{client?.address}</p>
					</div>
					<div>
						<p className="font-bold">School District</p>
						<p>{client?.schoolDistrict}</p>
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
											{secondClosestOfficeMiles} mi)
										</li>
										<li>
											{thirdClosestOffice?.prettyName} (
											{thirdClosestOfficeMiles} mi)
										</li>
									</ul>
								</PopoverContent>
							</Popover>
						</p>
						<p>
							{closestOffice?.prettyName} ({closestOfficeMiles} mi)
						</p>
					</div>
					{client?.schoolDistrict === "Unknown" && (
						<Alert variant="destructive">
							<AlertTriangleIcon />
							<AlertTitle>
								Unable to determine school district, double-check evaluators.
							</AlertTitle>
						</Alert>
					)}

					<ScrollArea className="dark w-full rounded-md border bg-card text-card-foreground">
						<div className="p-4">
							<h4 className="mb-4 font-bold leading-none">
								Eligible Evaluators
							</h4>
							{eligibleEvaluators?.map((evaluator) => (
								<div key={evaluator.npi}>
									<div key={evaluator.npi} className="text-sm">
										{evaluator.providerName}
									</div>
									<Separator key="separator" className="my-2" />
								</div>
							))}
						</div>
					</ScrollArea>
				</div>
			) : (
				<Skeleton className="h-40 w-[250px] rounded-md sm:w-[500px]" />
			)}
		</div>
	);
}
