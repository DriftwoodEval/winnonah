"use client";

import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatInBusinessTime } from "~/lib/utils";
import { scrambleText } from "~/lib/utils.client";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { useRedaction } from "../redaction/redaction";

function CredentialField({ label, value }: { label: string; value: string }) {
	const { enabled } = useRedaction();

	const copy = async () => {
		await navigator.clipboard.writeText(value);
		toast.success(`${label} copied to clipboard`);
	};

	return (
		<div className="space-y-1">
			<Label className="text-muted-foreground text-xs">{label}</Label>
			<div className="flex items-center gap-1">
				<Input
					className={enabled ? "select-none font-mono blur-sm" : "font-mono"}
					readOnly
					value={enabled ? scrambleText(value) : value}
				/>
				<Button onClick={copy} size="icon" type="button" variant="ghost">
					<Copy className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

function PearsonVerificationCode() {
	const { enabled } = useRedaction();
	const { mutate, data, isPending } =
		api.pyConfig.getPearsonVerificationEmail.useMutation({
			onError: (error) => toast.error(error.message),
		});

	const emailText = data?.body_text ?? data?.snippet;
	const code = emailText
		? (/verification code is:?\s*(\d+)/i.exec(emailText)?.[1] ??
			/\b\d{6}\b/.exec(emailText)?.[0])
		: undefined;

	const copy = async () => {
		if (!code) return;
		await navigator.clipboard.writeText(code);
		toast.success("Code copied to clipboard");
	};

	return (
		<div className="space-y-2 border-t pt-2">
			<Button
				disabled={isPending}
				onClick={() => mutate()}
				size="sm"
				type="button"
				variant="outline"
			>
				{isPending ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Mail className="h-4 w-4" />
				)}
				Fetch token email
			</Button>

			{data && (
				<div className="space-y-1 text-xs">
					<p className="text-muted-foreground">
						{formatInBusinessTime(data.date, "MMM d, h:mm a")} &middot;{" "}
						<Redact>{data.subject}</Redact>
					</p>
					{code ? (
						<div className="flex items-center gap-1">
							<Input
								className={
									enabled ? "select-none font-mono blur-sm" : "font-mono"
								}
								readOnly
								value={enabled ? scrambleText(code) : code}
							/>
							<Button onClick={copy} size="icon" type="button" variant="ghost">
								<Copy className="h-4 w-4" />
							</Button>
						</div>
					) : (
						<p className="whitespace-pre-wrap">
							<Redact>{emailText}</Redact>
						</p>
					)}
				</div>
			)}
		</div>
	);
}

export function QuestionnaireLoginsViewer() {
	const { data: services, isLoading } = api.pyConfig.getServices.useQuery();

	if (isLoading)
		return <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin" />;

	if (!services)
		return (
			<p className="text-muted-foreground text-sm">No services config found.</p>
		);

	const allServices = [
		"medicaid",
		"mhs",
		"qglobal",
		"wps",
		"novopsych",
	] as const;
	const serviceLabels: Record<string, string> = {
		medicaid: "SC Medicaid",
		mhs: "MHS",
		qglobal: "QGlobal",
		wps: "WPS",
		novopsych: "NovoPsych",
	};

	return (
		<div className="grid grid-cols-4 gap-4">
			{allServices.map((svc) => (
				<Card key={svc}>
					<CardHeader>
						<CardTitle>{serviceLabels[svc]}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<CredentialField label="User" value={services[svc].username} />
						<CredentialField label="Password" value={services[svc].password} />
						{svc === "qglobal" && <PearsonVerificationCode />}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
