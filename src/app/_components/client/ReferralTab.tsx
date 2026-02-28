"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Checkbox } from "@ui/checkbox";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Textarea } from "@ui/textarea";
import { differenceInMonths, differenceInYears } from "date-fns";
import {
	AlertCircle,
	ArrowUpCircle,
	Check,
	InfoIcon,
	Loader2,
	LockIcon,
	Square,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { ALLOWED_ASD_ADHD_VALUES } from "~/lib/constants";
import type { Client } from "~/lib/models";
import { api } from "~/trpc/react";

interface ReferralTabProps {
	client: Client;
	readOnly?: boolean;
}

export function ReferralTab({ client, readOnly }: ReferralTabProps) {
	const { data: session } = useSession();
	const can = useCheckPermission();
	const utils = api.useUtils();

	const [schoolIepStatus, setSchoolIepStatus] = useState<string>(
		client.referralData?.schoolIepStatus ?? "",
	);
	const [schoolExplanation, setMoreInfo] = useState<string>(
		client.referralData?.schoolExplanation ?? "",
	);
	const [otherNotes, setOtherNotes] = useState<string>(
		client.referralData?.otherNotes ?? "",
	);
	const [locationPreference, setLocationPreference] = useState<string>(
		client.referralData?.locationPreference ?? "",
	);
	const [email, setEmail] = useState<string>(
		client.referralData?.email ?? client.email ?? "",
	);

	useEffect(() => {
		setSchoolIepStatus(client.referralData?.schoolIepStatus ?? "");
		setMoreInfo(client.referralData?.schoolExplanation ?? "");
		setOtherNotes(client.referralData?.otherNotes ?? "");
		setLocationPreference(client.referralData?.locationPreference ?? "");
		setEmail(client.referralData?.email ?? client.email ?? "");
	}, [client.referralData, client.email]);

	const updateClientMutation = api.clients.update.useMutation({
		onSuccess: () => {
			utils.clients.getOne.invalidate({ column: "hash", value: client.hash });
		},
		onError: (error) => {
			toast.error("Failed to update referral info", {
				description: error.message,
			});
		},
	});

	const pushToPunchMutation = api.google.pushToPunch.useMutation({
		onSuccess: () => {
			toast.success("Pushed to punch list");
			void utils.google.getClientFromPunch.invalidate(client.id.toString());
			void utils.google.getDashboardData.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to push to punch list", {
				description: error.message,
			});
		},
	});

	const { data: punchClient, isLoading: isLoadingPunchClient } =
		api.google.getClientFromPunch.useQuery(client.id.toString(), {
			enabled: !!client.id,
		});

	const isNeedsReview = client.referralData?.needsReachOut === "review";

	const { data: pushPreview, isLoading: isLoadingPreview } =
		api.google.getPushPreview.useQuery(client.id, {
			enabled: !!client.id && isNeedsReview && can("clients:pushtopunch"),
		});

	const isReadOnly = readOnly || !!punchClient;

	const handleAsdAdhdChange = (value: string) => {
		updateClientMutation.mutate({
			clientId: client.id,
			asdAdhd: value as (typeof ALLOWED_ASD_ADHD_VALUES)[number],
		});
	};

	const handleReferralDataChange = (updates: {
		schoolIepStatus?: string;
		schoolExplanation?: string;
		otherNotes?: string;
		locationPreference?: string;
		needsReachOut?: "reach_out" | "review" | null;
		email?: string;
	}) => {
		const newReferralData = {
			...client.referralData,
			...updates,
		};
		updateClientMutation.mutate({
			clientId: client.id,
			referralData: newReferralData,
		});
	};

	const userName = session?.user?.name?.split(" ")[0] ?? "(Your Name)";
	const asdAdhdValue = client.asdAdhd ?? "(Diagnosis)";
	const isAdhd = client.asdAdhd === "ADHD";

	const ageInMonths = differenceInMonths(new Date(), new Date(client.dob));
	const ageInYears = differenceInYears(new Date(), new Date(client.dob));
	const showSchoolQuestion = !isAdhd && ageInMonths >= 33 && ageInYears <= 19;

	const isBabyNet =
		client.babyNet ||
		client.primaryInsurance?.toLowerCase().includes("babynet") ||
		client.secondaryInsurance?.toLowerCase().includes("babynet");

	const isNeedsReachOut = client.referralData?.needsReachOut === "reach_out";

	return (
		<div className="flex flex-col gap-4">
			{isBabyNet && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>REFERRAL TAB SHOULD NOT BE USED</AlertTitle>
					<AlertDescription>
						REFERRAL TAB SHOULD NOT BE USED BASED ON BABYNET STATUS
					</AlertDescription>
				</Alert>
			)}

			{punchClient && (
				<Alert>
					<LockIcon className="h-4 w-4" />
					<AlertTitle>Read Only</AlertTitle>
					<AlertDescription>
						This client is already on the punchlist. Referral information cannot
						be edited here.
					</AlertDescription>
				</Alert>
			)}

			<Card className="w-full">
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle>Referral Information</CardTitle>
					<div className="flex items-center space-x-2">
						<Checkbox
							checked={isNeedsReachOut || isNeedsReview}
							disabled={
								isReadOnly ||
								updateClientMutation.isPending ||
								isNeedsReview ||
								!can("clients:reachout")
							}
							id="needsReachOutReferral"
							onCheckedChange={(checked) =>
								handleReferralDataChange({
									needsReachOut: checked === true ? "reach_out" : null,
								})
							}
						/>
						<Label className="font-medium" htmlFor="needsReachOutReferral">
							Needs Reach Out
						</Label>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="asdAdhd">This is for</Label>
							<Select
								disabled={isReadOnly || updateClientMutation.isPending}
								onValueChange={handleAsdAdhdChange}
								value={client.asdAdhd ?? undefined}
							>
								<SelectTrigger id="asdAdhd">
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									{ALLOWED_ASD_ADHD_VALUES.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>They have</Label>
							<div className="py-2 font-medium text-sm">
								{client.primaryInsurance
									? `${client.primaryInsurance}${client.secondaryInsurance ? ` | ${client.secondaryInsurance}` : ""}`
									: "No insurance information"}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="w-full">
				<CardHeader>
					<CardTitle>Intake Script</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
						<p>
							This is {userName} from Driftwood Evaluation Center. We received
							your referral and wanted to ask you some questions to get started
							on our process.
						</p>
						<p>
							I just want to confirm you and/or your pediatrician have concerns
							about potential{" "}
							{asdAdhdValue
								.replace("ASD", "autism")
								.replace("LD", "learning disability")}
							.
						</p>
						{showSchoolQuestion && (
							<p>
								Has the child been evaluated at school? Do they have an IEP or
								504 plan?
							</p>
						)}
					</div>

					{showSchoolQuestion && (
						<div className="space-y-4">
							<div className="space-y-3">
								<Label className="font-semibold">
									School / IEP / 504 Status
								</Label>
								<RadioGroup
									className="flex flex-wrap gap-4"
									disabled={isReadOnly || updateClientMutation.isPending}
									onValueChange={(value) => {
										setSchoolIepStatus(value);
										handleReferralDataChange({ schoolIepStatus: value });
									}}
									value={schoolIepStatus}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id="yes" value="yes" />
										<Label className="font-normal" htmlFor="yes">
											Yes
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id="no" value="no" />
										<Label className="font-normal" htmlFor="no">
											No
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id="idk" value="idk" />
										<Label className="font-normal" htmlFor="idk">
											I Don't Know
										</Label>
									</div>
								</RadioGroup>
							</div>

							<div className="space-y-2">
								<Label className="font-semibold" htmlFor="schoolExplanation">
									Explanation
								</Label>
								<Textarea
									disabled={isReadOnly || updateClientMutation.isPending}
									id="schoolExplanation"
									onBlur={() => {
										if (
											schoolExplanation !==
											(client.referralData?.schoolExplanation ?? "")
										) {
											handleReferralDataChange({ schoolExplanation });
										}
									}}
									onChange={(e) => setMoreInfo(e.target.value)}
									placeholder="..."
									value={schoolExplanation}
								/>
							</div>
						</div>
					)}

					<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
						<p>
							We would like to set you up in our Patient Portal. To do that, we
							need to send you an email.{" "}
							{client.email
								? `I just want to confirm that your email is "${client.email}"?`
								: "Can I please have your email address?"}
						</p>
					</div>

					<div className="space-y-4">
						<div className="space-y-2">
							<Label className="font-semibold" htmlFor="email">
								Email Address
							</Label>
							<Input
								disabled={isReadOnly || updateClientMutation.isPending}
								id="email"
								onBlur={() => {
									if (
										email !== (client.referralData?.email ?? client.email ?? "")
									) {
										handleReferralDataChange({ email });
									}
								}}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Enter email address..."
								type="email"
								value={email}
							/>
						</div>

						<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
							<p>
								Once you receive that email, please sign into the Patient
								Portal. You will use the client's date of birth. Let me know if
								you have trouble with that process.
							</p>

							<p>
								Once you're in the portal, there will be documents to sign. They
								usually will pop up as part of the sign-up process. Please
								complete them so we can move forward.
							</p>

							{isAdhd ? (
								<>
									<p>
										We will send you a questionnaire through the portal soon.
										Look for a new message, which is usually in the upper right
										hand corner of the screen. You will also get an email
										telling you that you have a new message.
									</p>
									<p>
										We will contact you after this is done to set up the
										appointment.
									</p>
									<p>
										This appointment takes 1 hour and can be done either
										virtually or in person.
									</p>
								</>
							) : (
								<>
									<p>
										We will request records from the school district and then be
										in touch to discuss next steps.
									</p>
									<p>
										Generally, we will schedule an intake appointment via
										Telehealth. From there, we will request approval from
										insurance before sending more questionnaires in order to get
										the in-person comprehensive evaluation scheduled.
									</p>
									<p>
										This process takes approximately 6 months to complete, so
										please be patient with us as we help as many people as
										possible across the state.
									</p>
								</>
							)}
						</div>

						{isAdhd && (
							<div className="space-y-2">
								<Label className="font-semibold">Preference?</Label>
								<RadioGroup
									className="flex flex-wrap gap-4"
									disabled={isReadOnly || updateClientMutation.isPending}
									onValueChange={(value) => {
										setLocationPreference(value);
										handleReferralDataChange({ locationPreference: value });
									}}
									value={locationPreference}
								>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id="virtual" value="virtual" />
										<Label className="font-normal" htmlFor="virtual">
											Virtual
										</Label>
									</div>
									<div className="flex items-center space-x-2">
										<RadioGroupItem id="in-person" value="in-person" />
										<Label className="font-normal" htmlFor="in-person">
											In Person
										</Label>
									</div>
								</RadioGroup>
							</div>
						)}
						<div className="space-y-2">
							<Label className="font-semibold" htmlFor="otherNotes">
								Other Notes
							</Label>
							<Textarea
								disabled={isReadOnly || updateClientMutation.isPending}
								id="otherNotes"
								onBlur={() => {
									if (otherNotes !== (client.referralData?.otherNotes ?? "")) {
										handleReferralDataChange({ otherNotes });
									}
								}}
								onChange={(e) => setOtherNotes(e.target.value)}
								placeholder="..."
								value={otherNotes}
							/>
						</div>
					</div>

					<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
						<h3 className="font-semibold">TherapyAppointment Message</h3>
						<p>
							Welcome to Driftwood! Thank you for setting up access to our
							patient portal. In the coming days, you should receive another
							message here with links to up to five questionnaires. Please
							complete each questionnaire completely so that we can move forward
							in scheduling an appointment for the client. Additionally, please
							review this information in preparation for your upcoming
							appointment: https://driftwoodeval.com/eval-process
						</p>
					</div>

					{isNeedsReview && can("clients:pushtopunch") && !punchClient && (
						<Alert className="bg-secondary/20">
							<InfoIcon className="h-4 w-4" />
							<AlertTitle>Push to Punch Preview</AlertTitle>
							<AlertDescription>
								{isLoadingPreview ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : pushPreview ? (
									<div className="mt-2 grid grid-cols-2 items-center gap-x-4 gap-y-1 text-xs">
										<span className="font-semibold text-muted-foreground uppercase">
											Primary:
										</span>
										<span>{pushPreview.primaryPayer}</span>
										{pushPreview.secondaryPayer && (
											<>
												<span className="font-semibold text-muted-foreground uppercase">
													Secondary:
												</span>
												<span>{pushPreview.secondaryPayer}</span>
											</>
										)}
										<span className="font-semibold text-muted-foreground uppercase">
											For:
										</span>
										<span>{pushPreview.asdAdhd}</span>
										<span className="font-semibold text-muted-foreground uppercase">
											Location:
										</span>
										<span>{pushPreview.location ?? "Unknown"}</span>
										<span className="font-semibold text-muted-foreground uppercase">
											DA Qs:
										</span>
										<span>
											{pushPreview.daQsNeeded ? (
												<Check className="h-3 w-3" />
											) : (
												<Square className="h-3 w-3 text-muted-foreground" />
											)}
										</span>
										<span className="font-semibold text-muted-foreground uppercase">
											EVAL Qs:
										</span>
										<span>
											{pushPreview.evalQsNeeded ? (
												<Check className="h-3 w-3" />
											) : (
												<Square className="h-3 w-3 text-muted-foreground" />
											)}
										</span>
										<span className="col-span-2 my-1">
											Additionally, pushing will update this data in the EMR:
										</span>
										<span className="font-semibold text-muted-foreground uppercase">
											Records:
										</span>
										<span>{pushPreview.recordsNeeded ?? "Not Needed"}</span>
									</div>
								) : (
									"Failed to load preview."
								)}
							</AlertDescription>
						</Alert>
					)}

					<div className="flex flex-wrap gap-2">
						<Button
							className="w-full sm:w-auto"
							disabled={
								isReadOnly ||
								updateClientMutation.isPending ||
								!can("clients:reviewreachout")
							}
							onClick={() =>
								handleReferralDataChange({
									needsReachOut: isNeedsReview ? null : "review",
								})
							}
							variant={isNeedsReview ? "secondary" : "default"}
						>
							{isNeedsReview ? "Marked for Review" : "Mark for Review"}
						</Button>

						{isNeedsReview && can("clients:pushtopunch") && (
							<Button
								className="w-full sm:w-auto"
								disabled={
									isReadOnly ||
									pushToPunchMutation.isPending ||
									!!punchClient ||
									isLoadingPunchClient
								}
								onClick={() => pushToPunchMutation.mutate(client.id)}
								variant="outline"
							>
								{pushToPunchMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<ArrowUpCircle className="mr-2 h-4 w-4" />
								)}
								{punchClient ? "Already on Punchlist" : "Push to Punchlist"}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
