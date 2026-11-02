"use client";

import { Redact } from "@components/redaction/Redact";
import { useRedaction } from "@components/redaction/redaction";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
	Copy,
	ExternalLink,
	Loader2,
	Mail,
	Pencil,
	Plus,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { formatInBusinessTime } from "~/lib/utils";
import { scrambleText } from "~/lib/utils.client";
import { api } from "~/trpc/react";
import { LoginAccessDialog } from "./LoginAccessDialog";
import { type Login, LoginDialog } from "./LoginDialog";

function CredentialField({ label, value }: { label: string; value: string }) {
	const { enabled } = useRedaction();

	const copy = async () => {
		await navigator.clipboard.writeText(value);
		toast.success(`${label} copied to clipboard`);
	};

	return (
		<div className="space-y-1">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			<div className="flex items-center gap-1">
				<Input
					className={enabled ? "font-mono blur-sm select-none" : "font-mono"}
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
									enabled ? "font-mono blur-sm select-none" : "font-mono"
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

function LoginCard({
	login,
	onEdit,
	onDelete,
	onManageAccess,
}: {
	login: Login;
	onEdit: () => void;
	onDelete: () => void;
	onManageAccess: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<CardTitle>{login.name}</CardTitle>
					<div className="flex shrink-0 gap-1">
						{login.access && (
							<Button
								onClick={onManageAccess}
								size="icon"
								title="Manage access"
								type="button"
								variant="ghost"
							>
								<ShieldCheck className="h-4 w-4" />
							</Button>
						)}
						{login.canEdit && (
							<Button
								onClick={onEdit}
								size="icon"
								title="Edit"
								type="button"
								variant="ghost"
							>
								<Pencil className="h-4 w-4" />
							</Button>
						)}
						{login.canDelete && (
							<Button
								onClick={onDelete}
								size="icon"
								title="Delete"
								type="button"
								variant="ghost"
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						)}
					</div>
				</div>
				{login.url && (
					<a
						className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
						href={login.url}
						rel="noreferrer"
						target="_blank"
					>
						<ExternalLink className="h-3 w-3" />
						{login.url}
					</a>
				)}
			</CardHeader>
			<CardContent className="space-y-2">
				{login.notes && (
					<p className="text-sm whitespace-pre-wrap text-muted-foreground">
						{login.notes}
					</p>
				)}
				{login.fields.map((field) => (
					<CredentialField
						key={field.name}
						label={field.label}
						value={field.value}
					/>
				))}
				{login.builtInKey === "qglobal" && <PearsonVerificationCode />}
			</CardContent>
		</Card>
	);
}

export function LoginsViewer() {
	const can = useCheckPermission();
	const utils = api.useUtils();
	const { data: logins, isLoading } = api.logins.list.useQuery();
	const [isCreating, setIsCreating] = useState(false);
	const [editing, setEditing] = useState<Login | null>(null);
	const [deleting, setDeleting] = useState<Login | null>(null);
	const [managingAccess, setManagingAccess] = useState<Login | null>(null);

	const deleteLogin = api.logins.delete.useMutation({
		onSuccess: () => {
			toast.success("Login deleted");
			void utils.logins.invalidate();
			setDeleting(null);
		},
		onError: (error) => toast.error(`Error: ${error.message}`),
	});

	if (isLoading)
		return <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin" />;

	return (
		<>
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Logins</h1>
				{can("settings:qsuite:logins:create") && (
					<Button onClick={() => setIsCreating(true)} type="button">
						<Plus className="h-4 w-4" />
						Add Login
					</Button>
				)}
			</div>

			{!logins?.length ? (
				<p className="text-sm text-muted-foreground">
					You don't have access to any logins yet.
				</p>
			) : (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					{logins.map((login) => (
						<LoginCard
							key={login.id}
							login={login}
							onDelete={() => setDeleting(login)}
							onEdit={() => setEditing(login)}
							onManageAccess={() => setManagingAccess(login)}
						/>
					))}
				</div>
			)}

			<LoginDialog isOpen={isCreating} onClose={() => setIsCreating(false)} />
			<LoginDialog
				isOpen={!!editing}
				login={editing ?? undefined}
				onClose={() => setEditing(null)}
			/>
			<LoginAccessDialog
				login={managingAccess}
				onClose={() => setManagingAccess(null)}
			/>

			<AlertDialog onOpenChange={() => setDeleting(null)} open={!!deleting}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the login and its saved credentials for everyone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								deleting && deleteLogin.mutate({ id: deleting.id })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
