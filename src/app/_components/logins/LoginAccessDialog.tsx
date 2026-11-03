"use client";

import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Label } from "@ui/label";
import MultipleSelector, { type Option } from "@ui/multiple-selector";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	LOGIN_VERB_LABELS,
	LOGIN_VERBS,
	type LoginAccess,
	type LoginVerb,
} from "~/lib/logins";
import { api } from "~/trpc/react";
import type { Login } from "./LoginDialog";

const ROLE_PREFIX = "role:";
const USER_PREFIX = "user:";

/** Edit who can view, edit, and delete one login, by role or by person. */
export function LoginAccessDialog({
	login,
	onClose,
}: {
	login: Login | null;
	onClose: () => void;
}) {
	const utils = api.useUtils();
	const { data: roles } = api.roles.getAll.useQuery();
	const { data: users } = api.users.getAll.useQuery({ archived: false });
	const [access, setAccess] = useState<LoginAccess | null>(null);

	useEffect(() => {
		setAccess(login?.access ?? null);
	}, [login]);

	const options: Option[] = useMemo(
		() => [
			...(roles ?? []).map((role) => ({
				value: `${ROLE_PREFIX}${role.id}`,
				label: `Role: ${role.name}`,
			})),
			...(users ?? []).map((user) => ({
				value: `${USER_PREFIX}${user.id}`,
				label: user.name ?? user.email,
			})),
		],
		[roles, users],
	);

	const save = api.logins.setAccess.useMutation({
		onSuccess: () => {
			toast.success("Access updated");
			void utils.logins.invalidate();
			onClose();
		},
		onError: (error) => toast.error(`Error: ${error.message}`),
	});

	const selectedFor = (verb: LoginVerb): Option[] => {
		const principals = access?.[verb];
		if (!principals) return [];
		const ids = [
			...principals.roleIds.map((id) => `${ROLE_PREFIX}${id}`),
			...principals.userIds.map((id) => `${USER_PREFIX}${id}`),
		];
		return ids.flatMap((id) => options.filter((o) => o.value === id));
	};

	const onChangeFor = (verb: LoginVerb, selected: Option[]) => {
		if (!access) return;
		const roleIds = selected
			.filter((o) => o.value.startsWith(ROLE_PREFIX))
			.map((o) => Number(o.value.slice(ROLE_PREFIX.length)));
		const userIds = selected
			.filter((o) => o.value.startsWith(USER_PREFIX))
			.map((o) => o.value.slice(USER_PREFIX.length));
		setAccess({ ...access, [verb]: { roleIds, userIds } });
	};

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open={!!login}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Access to {login?.name}</DialogTitle>
					<DialogDescription>
						Choose who can use this login. Editing or deleting includes viewing.
						People with a global login permission can always reach it.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					{LOGIN_VERBS.map((verb) => (
						<div className="space-y-1" key={verb}>
							<Label>{LOGIN_VERB_LABELS[verb]}</Label>
							<MultipleSelector
								badgeClassName="bg-secondary text-secondary-foreground"
								emptyIndicator={
									<p className="text-center text-sm text-muted-foreground">
										No matches.
									</p>
								}
								onChange={(selected) => onChangeFor(verb, selected)}
								options={options}
								placeholder="Add roles or people..."
								value={selectedFor(verb)}
							/>
						</div>
					))}
					<div className="flex justify-end gap-2 pt-2">
						<Button onClick={onClose} type="button" variant="ghost">
							Cancel
						</Button>
						<Button
							disabled={!login || !access || save.isPending}
							onClick={() =>
								login && access && save.mutate({ id: login.id, access })
							}
							type="button"
						>
							{save.isPending ? "Saving..." : "Save"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
