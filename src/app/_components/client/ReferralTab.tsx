"use client";

import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
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
	Armchair,
	ArrowUpCircle,
	Check,
	Copy,
	InfoIcon,
	Loader2,
	LockIcon,
	Send,
	Square,
} from "lucide-react";
import Link from "next/link";
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

const TA_MESSAGE =
	"Welcome to Driftwood! Thank you for setting up access to our patient portal. If you haven't already, make sure to complete all the documents and forms. Additionally, in the coming days you should receive another message here with links to questionnaires. Please complete each questionnaire completely so that we can move forward in scheduling an appointment. Failure to complete any of these steps will prevent you from moving forward.\n\nAdditionally, please review this information to better understand our process: https://driftwoodeval.com/eval-process";

const COMMON_LANGUAGES = ["English", "Spanish", "Portuguese"];

export function ReferralTab({ client, readOnly }: ReferralTabProps) {
	const { data: session } = useSession();
	const can = useCheckPermission();
	const utils = api.useUtils();

	const [notes, setNotes] = useState<string>(client.referralData?.notes ?? "");
	const [language, setLanguage] = useState<string>(
		client.language ?? "English",
	);

	const [schoolExplanation, setSchoolExplanation] = useState<string>(
		client.referralData?.schoolExplanation ?? "",
	);
	const [otherNotes, setOtherNotes] = useState<string>(
		client.referralData?.otherNotes ?? "",
	);
	const [locationPreference, setLocationPreference] = useState<string>(
		client.referralData?.locationPreference ?? "",
	);
	const [followedByBabyNet, setFollowedByBabyNet] = useState<
		"yes" | "no" | null
	>(client.referralData?.followedByBabyNet ?? null);

	useEffect(() => {
		setNotes(client.referralData?.notes ?? "");
		setLanguage(client.language ?? "English");
		setSchoolExplanation(client.referralData?.schoolExplanation ?? "");
		setOtherNotes(client.referralData?.otherNotes ?? "");
		setLocationPreference(client.referralData?.locationPreference ?? "");
		setFollowedByBabyNet(client.referralData?.followedByBabyNet ?? null);
	}, [client.referralData, client.language]);

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
			void utils.notes.getNoteByClientId.invalidate(client.id);
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
			enabled:
				!!client.id && isNeedsReview && can("clients:referral:pushtopunch"),
		});

	const isReadOnly = readOnly || !!punchClient;

	const handleAsdAdhdChange = (value: string) => {
		updateClientMutation.mutate({
			clientId: client.id,
			asdAdhd:
				value === "none"
					? null
					: (value as (typeof ALLOWED_ASD_ADHD_VALUES)[number]),
		});
	};

	const handleLanguageChange = (value: string) => {
		updateClientMutation.mutate({
			clientId: client.id,
			language: value,
		});
	};

	const handleReferralDataChange = (updates: {
		notes?: string;
		schoolExplanation?: string;
		otherNotes?: string;
		locationPreference?: string;
		needsReachOut?: "reach_out" | "review" | null;
		followedByBabyNet?: "yes" | "no" | null;
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

	const sendMessageMutation = api.quo.sendMessage.useMutation({
		onSuccess: (_data, variables) => {
			toast.success("Text message sent");
			void utils.quo.getContactTimeline.invalidate({
				phoneNumber: variables.phoneNumber,
			});
		},
		onError: (error) => {
			toast.error("Failed to send text message", {
				description: error.message,
			});
		},
	});

	const handleSendBabyNetText = () => {
		if (!client.phoneNumber) {
			toast.error("Client has no phone number");
			return;
		}

		sendMessageMutation.mutate({
			phoneNumber: client.phoneNumber,
			message:
				"Here is the link to send to your Early Interventionist. https://www.driftwoodeval.com/babynet\nThank you!",
		});
	};

	const userName = session?.user?.name?.split(" ")[0] ?? "(Your Name)";
	const asdAdhdValue = client.asdAdhd ?? "(Diagnosis)";
	const isAdhd = client.asdAdhd === "ADHD";
	const isSpanish = client.language === "Spanish";

	const ageInMonths = differenceInMonths(new Date(), new Date(client.dob));
	const ageInYears = differenceInYears(new Date(), new Date(client.dob));
	const showSchoolQuestion = ageInMonths >= 33 && ageInYears <= 19;
	const isUnder3 = ageInYears < 3;

	const isBabyNet =
		client.babyNet ||
		client.primaryInsurance?.toLowerCase().includes("babynet") ||
		(client.secondaryInsurance ?? []).some((s) =>
			s.toLowerCase().includes("babynet"),
		);

	const isNeedsReachOut = client.referralData?.needsReachOut === "reach_out";

	const isCommonLanguage = COMMON_LANGUAGES.includes(language);

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
								!can("clients:referral:infobox")
							}
							id="needsReachOutReferral"
							onCheckedChange={(checked) =>
								handleReferralDataChange({
									needsReachOut: checked === true ? "reach_out" : null,
								})
							}
						/>
						<Label className="font-medium" htmlFor="needsReachOutReferral">
							Needs Outreach
						</Label>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label className="font-semibold" htmlFor="referralNotes">
							Notes
						</Label>
						<Textarea
							disabled={
								isReadOnly ||
								updateClientMutation.isPending ||
								!can("clients:referral:infobox")
							}
							id="referralNotes"
							onBlur={() => {
								if (notes !== (client.referralData?.notes ?? "")) {
									handleReferralDataChange({ notes });
								}
							}}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Add referral notes here..."
							value={notes}
						/>
					</div>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="asdAdhd">This is for</Label>
							<Select
								disabled={
									isReadOnly ||
									updateClientMutation.isPending ||
									!can("clients:asdadhd")
								}
								onValueChange={handleAsdAdhdChange}
								value={client.asdAdhd ?? ""}
							>
								<SelectTrigger id="asdAdhd">
									<SelectValue placeholder="Select status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{ALLOWED_ASD_ADHD_VALUES.map((value) => (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Language</Label>
							<div className="flex flex-wrap items-center gap-2">
								<Select
									disabled={isReadOnly || !can("clients:language")}
									onValueChange={(val) => {
										if (val !== "Other") {
											setLanguage(val);
											handleLanguageChange(val);
										} else if (isCommonLanguage) {
											// Switching from a preset to custom, clear it for new input
											setLanguage("");
										}
									}}
									value={isCommonLanguage ? language : "Other"}
								>
									<SelectTrigger className="w-40">
										<SelectValue placeholder="Select language" />
									</SelectTrigger>
									<SelectContent>
										{COMMON_LANGUAGES.map((lang) => (
											<SelectItem key={lang} value={lang}>
												{lang}
											</SelectItem>
										))}
										<SelectItem value="Other">Other</SelectItem>
									</SelectContent>
								</Select>
								{!isCommonLanguage && (
									<Input
										className="h-9 w-40"
										disabled={isReadOnly || !can("clients:language")}
										onBlur={() => handleLanguageChange(language)}
										onChange={(e) => setLanguage(e.target.value)}
										placeholder="Specify..."
										value={language}
									/>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label>Insurance</Label>
							<div className="py-2 font-medium text-sm">
								{client.primaryInsurance
									? `${client.primaryInsurance}${client.secondaryInsurance && client.secondaryInsurance.length > 0 ? ` | ${client.secondaryInsurance.join(", ")}` : ""}`
									: "No insurance information"}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="w-full">
				<CardHeader>
					<CardTitle>Intake Script</CardTitle>
					<CardDescription>
						Call the client or the client's parent/guardian and follow the
						script below. Fill in information into the form fields.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
							{isSpanish ? (
								<p>
									Le habla Barbara, de Driftwood Evaluation Center. Hemos
									recibido su remisión y queríamos hacerle algunas preguntas
									para iniciar nuestro proceso.
								</p>
							) : (
								<p>
									This is {userName} from Driftwood Evaluation Center. We
									received your referral and wanted to ask you some questions to
									get started on our process.
								</p>
							)}

							{isSpanish ? (
								<p>
									Solo quiero confirmar si usted y/o el pediatra tienen
									inquietudes sobre la posibilidad de{" "}
									{asdAdhdValue
										.replace("ASD", "Autismo")
										.replace("LD", "discapacidades de aprendizaje")}
									.
								</p>
							) : (
								<p>
									I just want to confirm you and/or your pediatrician have
									concerns about potential{" "}
									{asdAdhdValue
										.replace("ASD", "autism")
										.replace("LD", "learning disability")}
									.
								</p>
							)}
						</div>

						{isUnder3 && (
							<div className="space-y-4">
								<div className="rounded-lg bg-muted p-4 text-sm">
									{isSpanish ? (
										<p>¿El Niño es seguido por BabyNet?</p>
									) : (
										<p>Is the child being followed by BabyNet?</p>
									)}
								</div>
								<div className="space-y-3 px-4">
									<Label className="font-semibold">BabyNet?</Label>
									<RadioGroup
										className="flex flex-wrap gap-4"
										disabled={
											isReadOnly ||
											updateClientMutation.isPending ||
											!can("clients:referral:fillout")
										}
										onValueChange={(value) => {
											const val = value as "yes" | "no";
											setFollowedByBabyNet(val);
											handleReferralDataChange({
												followedByBabyNet: val,
											});
										}}
										value={followedByBabyNet ?? undefined}
									>
										<div className="flex items-center space-x-2">
											<RadioGroupItem id="bn-yes" value="yes" />
											<Label className="font-normal" htmlFor="bn-yes">
												Yes
											</Label>
										</div>
										<div className="flex items-center space-x-2">
											<RadioGroupItem id="bn-no" value="no" />
											<Label className="font-normal" htmlFor="bn-no">
												No
											</Label>
										</div>
									</RadioGroup>
								</div>

								{followedByBabyNet === "yes" && (
									<div className="flex items-center justify-between rounded-lg bg-muted p-4 text-sm">
										{isSpanish ? (
											<p>
												Le estoy enviando un mensaje de texto, por favor envíelo
												a su especialista en intervención temprana.
											</p>
										) : (
											<p>
												I'm sending you a text, please forward it to your early
												interventionist.
											</p>
										)}
										<Button
											className="cursor-pointer"
											disabled={isReadOnly || sendMessageMutation.isPending}
											onClick={handleSendBabyNetText}
											size="sm"
										>
											{sendMessageMutation.isPending ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<Send className="mr-2 h-4 w-4" />
											)}
											Text Link
										</Button>
									</div>
								)}
							</div>
						)}

						{showSchoolQuestion && (
							<div className="space-y-4">
								<div className="rounded-lg bg-muted p-4 text-sm">
									{isSpanish ? (
										<p>¿Asiste el niño a una escuela chárter o privada?</p>
									) : (
										<p>Does the child go to charter / private school?</p>
									)}
								</div>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label
											className="font-semibold"
											htmlFor="schoolExplanation"
										>
											School Notes
										</Label>
										<Textarea
											disabled={
												isReadOnly ||
												updateClientMutation.isPending ||
												!can("clients:referral:fillout")
											}
											id="schoolExplanation"
											onBlur={() => {
												if (
													schoolExplanation !==
													(client.referralData?.schoolExplanation ?? "")
												) {
													handleReferralDataChange({ schoolExplanation });
												}
											}}
											onChange={(e) => setSchoolExplanation(e.target.value)}
											placeholder="..."
											value={schoolExplanation}
										/>
									</div>
								</div>
							</div>
						)}
					</div>

					{!isSpanish ? (
						<>
							<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
								<p>
									We would like to set you up in our{" "}
									{client.taHash ? (
										<Link
											className="underline"
											href={`https://api.portal.therapyappointment.com/n/client/${client.taHash}`}
											target="_blank"
										>
											Patient Portal
										</Link>
									) : (
										<span>Patient Portal</span>
									)}{" "}
									. To do that, we need to send you an email.{" "}
									{client.email
										? `I want to confirm that your email is "${client.email}"?`
										: "Can I please have your email address?"}
								</p>
							</div>

							<div className="space-y-4">
								<div className="flex flex-col gap-2 rounded-lg bg-accent p-4 text-accent-foreground text-sm">
									<div className="flex w-full items-center justify-between">
										<h3 className="font-semibold">
											Invite to TherapyAppointment
										</h3>
										<div className="flex items-center gap-2">
											{client.taHash && (
												<Link
													href={`https://api.portal.therapyappointment.com/n/client/${client.taHash}`}
													target="_blank"
												>
													<Armchair height="16" width="16" />
												</Link>
											)}
										</div>
									</div>
									<p>
										Go to the client's TherapyAppointment page by clicking the
										chair icon. If the client's email is different, update it in
										TherapyAppointment. Then, click{" "}
										<span className="font-bold">Send Portal Invitation</span>.
									</p>
									<p className="whitespace-pre-wrap"></p>
								</div>

								<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
									<p>
										I'd like you to create your account while we're on the phone
										together. You should receive an email from
										TherapyAppointment, please click on the link in that email
										to sign into the Patient Portal. You will use the client's
										date of birth to set up your account. Let me know if you
										have any questions with that process.
									</p>

									<p>
										Once you're in the portal, there will be documents to sign.
										They usually will pop up as part of the sign-up process.
										Please complete them so we can move forward.
									</p>

									{showSchoolQuestion && (
										<p>
											We will request records from the school district and then
											be in touch to discuss next steps.
										</p>
									)}

									{isAdhd ? (
										<>
											<p>
												We will send you a questionnaire through the portal
												soon. Look for a new message, which is usually in the
												upper right hand corner of the screen. You will also get
												an email telling you that you have a new message.
											</p>
											<p>
												We will contact you after this is done to set up the
												appointment.
											</p>
											<p>
												This appointment takes approximately 1 hour and can be
												done either virtually or in person.
											</p>
										</>
									) : (
										<>
											<p>
												Soon, we will send you questionnaires to complete. Look
												for a new message, which is usually in the upper right
												hand corner of the screen. You will also get an email
												telling you that you have a new message. Generally, we
												will schedule an intake appointment via video
												call/Telehealth. That appointment will tell us if we are
												moving ahead with the evaluation. If so, we will request
												approval from insurance before sending more
												questionnaires in order to get the in-person
												comprehensive evaluation scheduled.
											</p>
											<p>
												This process takes approximately 4-6 months to complete.
												It is very important that we have your cooperation with
												this process; if we have to wait for you to complete
												something that delays everything. Please be patient with
												us as we help as many people as possible across the
												state.
											</p>
										</>
									)}
								</div>

								{isAdhd && (
									<div className="space-y-2">
										<Label className="font-semibold">Preference?</Label>
										<RadioGroup
											className="flex flex-wrap gap-4"
											disabled={
												isReadOnly ||
												updateClientMutation.isPending ||
												!can("clients:referral:fillout")
											}
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
										disabled={
											isReadOnly ||
											updateClientMutation.isPending ||
											!can("clients:referral:fillout")
										}
										id="otherNotes"
										onBlur={() => {
											if (
												otherNotes !== (client.referralData?.otherNotes ?? "")
											) {
												handleReferralDataChange({ otherNotes });
											}
										}}
										onChange={(e) => setOtherNotes(e.target.value)}
										placeholder="..."
										value={otherNotes}
									/>
								</div>
							</div>

							<div className="flex flex-col gap-2 rounded-lg bg-accent p-4 text-accent-foreground text-sm">
								<div className="flex w-full items-center justify-between">
									<h3 className="font-semibold">TherapyAppointment Message</h3>
									<div className="flex items-center gap-2">
										<Button
											className="h-8 w-8"
											onClick={() => {
												void navigator.clipboard.writeText(TA_MESSAGE);
												toast.success("Copied to clipboard");
											}}
											size="icon"
											variant="ghost"
										>
											<Copy className="h-4 w-4" />
										</Button>
										{client.taHash && (
											<Link
												href={`https://api.portal.therapyappointment.com/n/client/${client.taHash}`}
												target="_blank"
											>
												<Armchair height="16" width="16" />
											</Link>
										)}
									</div>
								</div>
								<p className="font-bold">
									Copy the message below by clicking the two boxes in the top
									right. Go to the client's TherapyAppointment page by clicking
									the chair icon and send them the following message:
								</p>
								<p className="whitespace-pre-wrap">{TA_MESSAGE}</p>
							</div>
						</>
					) : (
						<div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
							{!isAdhd ? (
								<>
									<p>
										Pronto le enviaremos por correo electrónico algunos
										formularios de consentimiento y relacionados con la
										normativa HIPAA para que los firme; estos estarán en
										español. Una vez firmados, le enviaremos un cuestionario, el
										cual consiste en una lista de preguntas que deberá
										responder, también en español. Una vez completados, se le
										asignará un intérprete. Esta persona nos ayudará a programar
										su cita en nuestra oficina. Por lo general, en esa cita
										determinaremos si vamos a proceder con la evaluación. De ser
										así, solicitaremos el permiso de su compañía de seguros
										médico. Una vez recibida dicho permiso, le enviaremos más
										cuestionarios. Cuando estos estén completos, nuestro
										intérprete se comunicará con usted para programar la
										evaluación completa en persona.
									</p>
									{showSchoolQuestion && (
										<p>Solicitaremos los expedientes al distrito escolar.</p>
									)}
									<p>
										Este proceso tarda aproximadamente entre 4 y 6 meses en
										completarse. Es fundamental contar con su colaboración
										durante este proceso; si témenos que esperar que usted
										complete alguna tarea, esto retrasará todo el procedimiento.
										Le pedimos paciencia, ya que nuestra intención es ayudar al
										mayor número posible de personas en todo el estado.
									</p>
								</>
							) : (
								<p>
									Pronto le enviaremos por correo electrónico algunos
									formularios de consentimiento y relacionados con la normativa
									HIPAA para que nos los firme; estos estarán en español. Una
									vez firmados, le enviaremos un cuestionario —que consiste en
									una lista de preguntas para responder, también en español. Una
									vez completado, se le asignará un intérprete, quien nos
									ayudará a programar su cita en nuestra oficina.{" "}
									{showSchoolQuestion && (
										<span>
											Solicitaremos los expedientes al distrito escolar.
										</span>
									)}{" "}
									Nos pondremos en contacto con Usted una vez finalizado este
									proceso para concertar la cita. Esta cita tiene una duración
									aproximada de una hora.
								</p>
							)}
						</div>
					)}

					{isNeedsReview &&
						can("clients:referral:pushtopunch") &&
						!punchClient && (
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
											{pushPreview.language && (
												<>
													<span className="font-semibold text-muted-foreground uppercase">
														Language:
													</span>
													<span>{pushPreview.language}</span>
												</>
											)}
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
								!can("clients:referral:fillout")
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

						{isNeedsReview && can("clients:referral:pushtopunch") && (
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
