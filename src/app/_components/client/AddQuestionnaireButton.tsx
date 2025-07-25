"use client";
import { Button } from "@components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Calendar } from "../ui/calendar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "../ui/command";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface AddQuestionnaireButtonProps {
	clientId: number | undefined;
	asanaId: string | undefined | null;
}

const formSchema = z.object({
	questionnaireType: z.string().min(2),
	link: z.url(),
	sent: z.date().optional(),
});

export function AddQuestionnaireButton({
	clientId,
	asanaId,
}: AddQuestionnaireButtonProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const utils = api.useUtils();

	const { data: questionnaireList, isLoading: isLoadingList } =
		api.questionnaires.getQuestionnaireList.useQuery(
			{ clientId: clientId ?? 0 },
			{
				enabled: isDialogOpen && typeof clientId === "number",
			},
		);

	const addQuestionnaireToAsana = api.asana.addQuestionnaires.useMutation({
		onSuccess: (_data, variables) => {
			utils.asana.getProject.invalidate(variables.projectId);
		},
		onError: (error) => {
			console.error("Failed to add questionnaires to Asana:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	const addQuestionnaire = api.clients.addQuestionnaire.useMutation({
		onSuccess: (_data, variables) => {
			if (!asanaId) return;
			utils.clients.getSentQuestionnaires.invalidate(clientId);

			addQuestionnaireToAsana.mutate({
				projectId: asanaId,
				automatic: false,
				questionnaires: [
					{
						type: variables.questionnaireType,
						link: variables.link,
					},
				],
			});
			setIsDialogOpen(false);
			form.reset();
		},
		onError: (error) => {
			console.error("Failed to add questionnaire:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			questionnaireType: "",
			link: "",
			sent: new Date(),
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		if (typeof clientId !== "number") {
			return;
		}

		addQuestionnaire.mutate({
			clientId: clientId,
			questionnaireType: values.questionnaireType,
			link: values.link,
			sent: values.sent,
		});
	}
	return (
		<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
			<DialogTrigger asChild>
				<Button disabled={!asanaId} size="sm">
					Add Questionnaire
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add New Questionnaire</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
						<div className="flex flex-wrap justify-between">
							<FormField
								control={form.control}
								name="questionnaireType"
								render={({ field }) => (
									<FormItem className="flex w-5/10 flex-col">
										<FormLabel>Type</FormLabel>
										<Popover
											onOpenChange={setIsPopoverOpen}
											open={isPopoverOpen}
										>
											<PopoverTrigger asChild>
												<FormControl>
													{/** biome-ignore lint/a11y/useSemanticElements: ShadCN, so use special component */}
													<Button
														className={cn(
															"w-full justify-between",
															!field.value && "text-muted-foreground",
														)}
														disabled={isLoadingList}
														role="combobox"
														variant="outline"
													>
														{field.value
															? questionnaireList?.find(
																	(q) => q.name === field.value,
																)?.name
															: isLoadingList
																? "Loading..."
																: "Select a questionnaire"}
														<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
												<Command>
													<CommandInput placeholder="Search questionnaires..." />
													<CommandList>
														<CommandEmpty>No questionnaire found.</CommandEmpty>
														<CommandGroup>
															{questionnaireList?.map((q) => (
																<CommandItem
																	key={q.name}
																	onSelect={() => {
																		form.setValue("questionnaireType", q.name);
																		setIsPopoverOpen(false);
																	}}
																	value={q.name}
																>
																	<Check
																		className={cn(
																			"mr-2 h-4 w-4",
																			q.name === field.value
																				? "opacity-100"
																				: "opacity-0",
																		)}
																	/>
																	{q.name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="sent"
								render={({ field }) => (
									<FormItem className="flex w-5/12 flex-col">
										<FormLabel>Date Sent</FormLabel>
										<Popover>
											<PopoverTrigger asChild>
												<FormControl>
													<Button
														className={cn(
															"w-full pl-3 text-left font-normal",
															!field.value && "text-muted-foreground",
														)}
														variant={"outline"}
													>
														{field.value ? (
															format(field.value, "MMM d, yyyy")
														) : (
															<span>Pick a date</span>
														)}
														<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
													</Button>
												</FormControl>
											</PopoverTrigger>
											<PopoverContent align="start" className="w-auto p-0">
												<Calendar
													disabled={(date) =>
														date > new Date() || date < new Date("1900-01-01")
													}
													mode="single"
													onSelect={field.onChange}
													selected={field.value}
												/>
											</PopoverContent>
										</Popover>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="link"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Link</FormLabel>
									<FormControl>
										<Input placeholder="https://..." {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button
							disabled={addQuestionnaire.isPending || isLoadingList}
							type="submit"
						>
							{addQuestionnaire.isPending ? "Submitting..." : "Submit"}
						</Button>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
