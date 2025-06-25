"use client";

import { AlertTriangleIcon } from "lucide-react";
import { QuestionnaireForm } from "~/app/_components/questionnaireForm";
import { Alert, AlertTitle } from "~/app/_components/ui/alert";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/app/_components/ui/popover";
import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { Skeleton } from "~/app/_components/ui/skeleton";
import { cn, formatClientAge } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AddAsanaIdButton } from "./addAsanaIdButton";

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

	const asanaProjectResponse = api.asana.getProject.useQuery(
		client?.asanaId ?? "",
	);
	const asanaProject = asanaProjectResponse?.data?.data;

	return (
		<div className="mx-10 flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				{client ? (
					<div className="flex items-center gap-2">
						<h1 className="font-bold text-2xl">{client?.fullName}</h1>
						{!client?.asanaId && <AddAsanaIdButton client={client} />}
					</div>
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
						<p>{client?.dob ? formatClientAge(client?.dob) : ""}</p>
					</div>
					{!client?.addedDate && (
						<div>
							<p className="font-bold">Date of Entry</p>
							<p>{client?.addedDate?.toLocaleDateString("en-US")}</p>
						</div>
					)}
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
					{client?.dob &&
						client?.asdAdhd &&
						asanaProject &&
						client.primaryInsurance && (
							<QuestionnaireForm
								client={client}
								asanaText={asanaProject.notes}
							/>
						)}
					<ScrollArea className="max-h-60 w-full rounded-md border">
						<div className="p-4">
							<h4 className="mb-4 font-bold leading-none">
								Eligible Evaluators
							</h4>
							{eligibleEvaluators?.map((evaluator, index) => (
								<div key={evaluator.npi}>
									<div key={evaluator.npi} className="text-sm">
										{evaluator.providerName}
									</div>
									{index !== eligibleEvaluators.length - 1 && (
										<Separator key="separator" className="my-2" />
									)}
								</div>
							))}
						</div>
					</ScrollArea>
					{asanaProject && (
						<ScrollArea className="max-h-60 w-full whitespace-pre-wrap rounded-md border p-4">
							<h4 className="mb-4 font-bold leading-none">Asana Notes</h4>
							{asanaProject.notes}
						</ScrollArea>
					)}
				</div>
			) : (
				<Skeleton className="h-40 w-[250px] rounded-md sm:w-[500px]" />
			)}
		</div>
	);
}
