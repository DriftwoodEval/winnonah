import { Guard } from "@components/layout/Guard";
import { QuestionnaireDatabase } from "@components/questionnaires/QuestionnaireDatabase";
import type { Metadata } from "next";
import { env } from "~/env";

export const metadata: Metadata = {
	title: `Questionnaires | ${env.NEXT_PUBLIC_APP_TITLE}`,
};

export default async function Page() {
	return (
		<Guard permission="pages:questionnaires">
			<QuestionnaireDatabase />
		</Guard>
	);
}
