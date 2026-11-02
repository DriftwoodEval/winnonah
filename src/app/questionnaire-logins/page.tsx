import { Guard } from "@components/layout/Guard";
import { QuestionnaireLoginsViewer } from "@components/questionnaire-logins/QuestionnaireLoginsViewer";
import type { Metadata } from "next";
import { QUESTIONNAIRE_LOGIN_SERVICES } from "~/lib/constants";
import type { PermissionId } from "~/lib/types";

export const metadata: Metadata = {
	title: "Questionnaire Logins",
};

// Anyone who can see at least one login: all of them, or a single service's.
const ACCESS_PERMISSIONS: PermissionId[] = [
	"settings:qsuite:services",
	"settings:qsuite:services:view",
	...QUESTIONNAIRE_LOGIN_SERVICES.map((svc) => svc.permission),
];

export default function Page() {
	return (
		<Guard anyOf={ACCESS_PERMISSIONS}>
			<div className="mx-4 my-6 flex w-full flex-col gap-6 sm:mx-10 sm:my-10">
				<h1 className="text-2xl font-bold">Questionnaire Logins</h1>
				<QuestionnaireLoginsViewer />
			</div>
		</Guard>
	);
}
