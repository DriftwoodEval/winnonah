"use client";

import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CUSTOM_LOGIN_FIELDS } from "~/lib/logins";
import { api, type RouterOutputs } from "~/trpc/react";

export type Login = RouterOutputs["logins"]["list"][number];

type FormState = {
	name: string;
	url: string;
	notes: string;
	fields: Record<string, string>;
};

function initialState(login?: Login): FormState {
	return {
		name: login?.name ?? "",
		url: login?.url ?? "",
		notes: login?.notes ?? "",
		fields: Object.fromEntries(
			(login?.fields ?? CUSTOM_LOGIN_FIELDS).map((field) => [
				field.name,
				"value" in field ? field.value : "",
			]),
		),
	};
}

/** Create a login (no `login`) or edit an existing one. */
export function LoginDialog({
	isOpen,
	onClose,
	login,
}: {
	isOpen: boolean;
	onClose: () => void;
	login?: Login;
}) {
	const utils = api.useUtils();
	const isEditing = !!login;
	const isBuiltIn = !!login?.builtInKey;
	const [form, setForm] = useState<FormState>(initialState(login));

	useEffect(() => {
		if (isOpen) setForm(initialState(login));
	}, [isOpen, login]);

	const onSuccess = () => {
		toast.success(isEditing ? "Login updated" : "Login created");
		void utils.logins.invalidate();
		onClose();
	};
	const onError = (error: { message: string }) =>
		toast.error(`Error: ${error.message}`);

	const create = api.logins.create.useMutation({ onSuccess, onError });
	const update = api.logins.update.useMutation({ onSuccess, onError });
	const isPending = create.isPending || update.isPending;

	const fieldDefs = login?.fields ?? CUSTOM_LOGIN_FIELDS;

	const submit = () => {
		const { name, url, notes, fields } = form;
		if (login) {
			update.mutate({ id: login.id, name, url, notes, fields });
		} else {
			create.mutate({
				name,
				url,
				notes,
				username: fields.username ?? "",
				password: fields.password ?? "",
			});
		}
	};

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit Login" : "Add Login"}</DialogTitle>
					<DialogDescription>
						{isBuiltIn
							? "This login is used by the automated scripts. Changes to the credentials take effect on their next run."
							: "Shared login for a website or service the practice uses."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					<div className="space-y-1">
						<Label htmlFor="login-name">Name</Label>
						<Input
							disabled={isBuiltIn}
							id="login-name"
							onChange={(e) => setForm({ ...form, name: e.target.value })}
							placeholder="e.g., Insurance Portal"
							required
							value={form.name}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="login-url">Website</Label>
						<Input
							id="login-url"
							onChange={(e) => setForm({ ...form, url: e.target.value })}
							placeholder="https://"
							value={form.url}
						/>
					</div>
					{fieldDefs.map((field) => (
						<div className="space-y-1" key={field.name}>
							<Label htmlFor={`login-${field.name}`}>{field.label}</Label>
							<Input
								autoComplete="off"
								className="font-mono"
								id={`login-${field.name}`}
								onChange={(e) =>
									setForm({
										...form,
										fields: { ...form.fields, [field.name]: e.target.value },
									})
								}
								value={form.fields[field.name] ?? ""}
							/>
						</div>
					))}
					<div className="space-y-1">
						<Label htmlFor="login-notes">What is this login for?</Label>
						<Textarea
							id="login-notes"
							onChange={(e) => setForm({ ...form, notes: e.target.value })}
							placeholder="Who uses it, what it is used for, anything to know before signing in"
							rows={4}
							value={form.notes}
						/>
					</div>
					<div className="flex justify-end gap-2 pt-2">
						<Button onClick={onClose} type="button" variant="ghost">
							Cancel
						</Button>
						<Button disabled={isPending} type="submit">
							{isPending ? "Saving..." : "Save"}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
