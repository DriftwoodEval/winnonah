import { db } from "../src/server/db";
import { questionnaireReminderTemplates } from "../src/server/db/schema";

// Ported verbatim (as placeholders) from the wording that used to be hardcoded
// in the questionnaires repo's utils/messages.py. Keep in sync with
// DEFAULT_REMINDER_TEMPLATES there if you change the defaults in one place.
const templates: (typeof questionnaireReminderTemplates.$inferInsert)[] = [
	{
		reminderIndex: 0,
		variant: "DEFAULT",
		message:
			"Hello, this is $STAFF_NAME from Driftwood Evaluation Center. " +
			"We are moving towards scheduling an appointment. The next step is " +
			"we need you to complete your $QUESTIONNAIRE_WORD. You can find $IT_THEM " +
			"in the messages tab in our patient portal: $PORTAL_LINK Please reply to " +
			"this text with any questions. Thank you for your help.",
	},
	{
		reminderIndex: 0,
		variant: "POSTDA",
		message:
			"Hello, this is $STAFF_NAME from Driftwood Evaluation Center. " +
			"In order to finalize our review, we need you to complete your " +
			"$QUESTIONNAIRE_WORD. You can find $IT_THEM in the messages tab in our " +
			"patient portal: $PORTAL_LINK Please reply to this text with any " +
			"questions. Thank you for your help.",
	},
	{
		reminderIndex: 0,
		variant: "POSTEVAL",
		message:
			"Hello, this is $STAFF_NAME from Driftwood Evaluation Center. " +
			"In order to provide you with a comprehensive report, we need you to " +
			"complete your $QUESTIONNAIRE_WORD. You can find $IT_THEM in the " +
			"messages tab in our patient portal: $PORTAL_LINK Please reply to this " +
			"text with any questions. Thank you for your help.",
	},
	{
		reminderIndex: 1,
		variant: "DEFAULT",
		message:
			"Hello, this is $STAFF_NAME with Driftwood Evaluation Center. " +
			"We are waiting for you to complete the $QUESTIONNAIRE_WORD sent to you " +
			"$DISTANCE_PHRASE. We are unable to schedule your appointment until " +
			"$IT_THEY $IS_ARE completed in $ITS_THEIR entirety. You can find " +
			"$IT_THEM in the messages tab in our patient portal: $PORTAL_LINK " +
			"Please reply to this text with any questions. Thank you for your help.",
	},
	{
		reminderIndex: 1,
		variant: "POSTDA",
		message:
			"Hello, this is $STAFF_NAME with Driftwood Evaluation Center. " +
			"We are waiting for you to complete the $QUESTIONNAIRE_WORD sent to you " +
			"$DISTANCE_PHRASE. We are unable to finalize our review until $IT_THEY " +
			"$IS_ARE completed in $ITS_THEIR entirety. You can find $IT_THEM in the " +
			"messages tab in our patient portal: $PORTAL_LINK Please reply to this " +
			"text with any questions. Thank you for your help.",
	},
	{
		reminderIndex: 1,
		variant: "POSTEVAL",
		message:
			"Hello, this is $STAFF_NAME with Driftwood Evaluation Center. " +
			"We are waiting for you to complete the $QUESTIONNAIRE_WORD sent to you " +
			"$DISTANCE_PHRASE. We are unable to provide you with a comprehensive " +
			"report until $IT_THEY $IS_ARE completed in $ITS_THEIR entirety. You " +
			"can find $IT_THEM in the messages tab in our patient portal: " +
			"$PORTAL_LINK Please reply to this text with any questions. Thank you " +
			"for your help.",
	},
	{
		reminderIndex: 2,
		variant: "DEFAULT",
		message:
			"This is Driftwood Evaluation Center. If your $QUESTIONNAIRE_WORD " +
			"$IS_ARE not completed by $DEADLINE_DATE ($ESCALATION_DAYS days from " +
			"now), we will close out your referral. Reply to this text with any " +
			"concerns. You can find the $QUESTIONNAIRE_WORD in the messages tab in " +
			"our patient portal: $PORTAL_LINK",
	},
	{
		reminderIndex: 2,
		variant: "POSTDA",
		message:
			"This is Driftwood Evaluation Center. If your $QUESTIONNAIRE_WORD " +
			"$IS_ARE not completed by $DEADLINE_DATE ($ESCALATION_DAYS days from " +
			"now), we will be unable to move forward. Reply to this text with any " +
			"concerns. You can find the $QUESTIONNAIRE_WORD in the messages tab in " +
			"our patient portal: $PORTAL_LINK",
	},
	{
		reminderIndex: 2,
		variant: "POSTEVAL",
		message:
			"This is Driftwood Evaluation Center. If your $QUESTIONNAIRE_WORD " +
			"$IS_ARE not completed by $DEADLINE_DATE ($ESCALATION_DAYS days from " +
			"now), we will provide you with an incomplete report. Reply to this " +
			"text with any concerns. You can find the $QUESTIONNAIRE_WORD in the " +
			"messages tab in our patient portal: $PORTAL_LINK",
	},
];

async function seed() {
	console.log("Seeding questionnaire reminder templates...");

	const existing = await db.query.questionnaireReminderTemplates.findMany();
	if (existing.length > 0) {
		console.log(`Skipping: ${existing.length} templates already exist.`);
		return;
	}

	await db.insert(questionnaireReminderTemplates).values(templates);
	console.log(`Inserted ${templates.length} questionnaire reminder templates.`);
}

seed()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
