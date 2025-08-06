"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@ui/form";
import MultipleSelector from "@ui/multiple-selector";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getRecommendedQuestionnaires } from "~/server/lib/questionnaireList";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";

const optionSchema = z.object({
	label: z.string(),
	value: z.string(),
	group: z.string().optional(),
});

const FormSchema = z.object({
	questionnaires: z.array(optionSchema).min(1),
});

export function QuestionnaireForm({
	client,
	asanaText,
}: {
	asanaText: string;
	client: Client;
}) {
	const questionnaireList = api.questionnaires.getQuestionnaireList.useQuery({
		clientId: client.id,
	});

	const options =
		questionnaireList.data?.map((q) => ({
			label: q.name,
			value: q.name,
			group: q.site,
		})) || [];

	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
	});

	const [reccommendedQuestionnaireList, setRecommendedQuestionnaires] =
		useState<string[]>([]);

	useEffect(() => {
		const fetchRecommendedQuestionnaires = async () => {
			const reccommendedQuestionnaireList = await getRecommendedQuestionnaires(
				client,
				asanaText,
			);
			const formattedQuestionnaires = reccommendedQuestionnaireList
				.filter(
					(questionnaire: string) =>
						questionnaire !== "Too Young" && questionnaire !== "Done",
				)
				.map((questionnaire: string) => ({
					label: questionnaire,
					value: questionnaire,
				}));

			setRecommendedQuestionnaires(reccommendedQuestionnaireList);
			form.setValue("questionnaires", formattedQuestionnaires);
		};
		fetchRecommendedQuestionnaires();
	}, [client, asanaText, form]);
	const onSubmit = async (data: z.infer<typeof FormSchema>) => {
		console.log(data);
	};

	return (
		<Form {...form}>
			<form
				className="flex w-full items-center gap-4"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<FormField
					control={form.control}
					name="questionnaires"
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<MultipleSelector
									{...field}
									groupBy="group"
									hidePlaceholderWhenSelected={true}
									options={options}
									placeholder="Select questionnaires to send..."
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button>Send</Button>
			</form>
		</Form>
	);
}
