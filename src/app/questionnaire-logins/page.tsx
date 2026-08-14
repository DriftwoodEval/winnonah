import { Guard } from "@components/layout/Guard";
import { QuestionnaireLoginsViewer } from "@components/questionnaire-logins/QuestionnaireLoginsViewer";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Questionnaire Logins",
};

export default function Page() {
	return (
		<Guard
			anyOf={["settings:qsuite:services:view", "settings:qsuite:services"]}
		>
			<div className="mx-4 my-6 flex w-full flex-col gap-6 sm:mx-10 sm:my-10">
				<h1 className="font-bold text-2xl">Questionnaire Logins</h1>
				<QuestionnaireLoginsViewer />
			</div>
		</Guard>
	);
}
