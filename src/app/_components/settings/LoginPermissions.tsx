"use client";

import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Checkbox } from "@ui/checkbox";
import { FormLabel } from "@ui/form";
import {
	LOGIN_VERB_LABELS,
	LOGIN_VERBS,
	type LoginVerb,
	loginPermissionKey,
} from "~/lib/logins";
import type { PermissionsObject } from "~/lib/types";

export const LOGIN_PERMISSIONS_ITEM = "logins";

type LoginOption = { id: number; name: string };

/**
 * The per-login permissions in the permissions editor: one row per login with
 * view, edit, and delete checkboxes. Edit and delete include viewing, so
 * checking either also checks view and unchecking view clears both.
 */
export function LoginPermissions({
	logins,
	value,
	effective,
	disabled,
	onChange,
}: {
	logins: LoginOption[];
	value: PermissionsObject;
	effective: PermissionsObject;
	disabled: boolean;
	onChange: (permissions: PermissionsObject) => void;
}) {
	const granted = effective as Record<string, boolean | undefined>;
	const isChecked = (login: LoginOption, verb: LoginVerb) =>
		granted[loginPermissionKey(login.id, verb)] === true;

	const toggle = (login: LoginOption, verb: LoginVerb, checked: boolean) => {
		const updates: Record<string, boolean> = {
			[loginPermissionKey(login.id, verb)]: checked,
		};
		if (checked && verb !== "view") {
			updates[loginPermissionKey(login.id, "view")] = true;
		}
		if (!checked && verb === "view") {
			updates[loginPermissionKey(login.id, "edit")] = false;
			updates[loginPermissionKey(login.id, "delete")] = false;
		}
		onChange({ ...value, ...updates });
	};

	return (
		<AccordionItem value={LOGIN_PERMISSIONS_ITEM}>
			<AccordionTrigger className="px-4 text-base font-semibold hover:no-underline">
				Logins
			</AccordionTrigger>
			<AccordionContent className="space-y-3 px-4 pt-2 pb-4">
				<p className="text-sm text-muted-foreground">
					Choose which logins this applies to. The QSuite permissions above
					cover every login.
				</p>
				{logins.map((login) => (
					<div
						className="flex flex-wrap items-center gap-x-6 gap-y-1"
						key={login.id}
					>
						<span className="w-40 font-medium">{login.name}</span>
						{LOGIN_VERBS.map((verb) => {
							const id = `login-${login.id}-${verb}`;
							return (
								<div className="flex items-center space-x-2" key={verb}>
									<Checkbox
										checked={isChecked(login, verb)}
										disabled={disabled}
										id={id}
										onCheckedChange={(checked) =>
											toggle(login, verb, !!checked)
										}
									/>
									<FormLabel className="font-normal" htmlFor={id}>
										{LOGIN_VERB_LABELS[verb]}
									</FormLabel>
								</div>
							);
						})}
					</div>
				))}
			</AccordionContent>
		</AccordionItem>
	);
}
