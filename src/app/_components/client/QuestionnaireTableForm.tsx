"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

const formSchema = z.object({
	questionnaireType: z.string().min(1, "Type is required"),
	link: z.url("Must be a valid URL"),
	sent: z.date(),
	status: z.enum(["PENDING", "COMPLETED", "RESCHEDULED"]).optional(),
});

export type QuestionnaireTableFormValues = z.infer<typeof formSchema>;
type Questionnaire = NonNullable<
	RouterOutputs["questionnaires"]["getSentQuestionnaires"]
>[number];

interface QuestionnaireFormProps {
	clientId: number;
	initialData?: Questionnaire;
	onSubmit: (values: QuestionnaireTableFormValues) => void;
	isLoading: boolean;
	newQ: boolean;
}

export function QuestionnaireTableForm({
	clientId,
	initialData,
	onSubmit,
	isLoading,
	newQ,
}: QuestionnaireFormProps) {
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);

	const { data: questionnaireList, isLoading: isLoadingList } =
		api.questionnaires.getQuestionnaireList.useQuery(
			{ clientId },
			{ enabled: typeof clientId === "number" },
		);

	const form = useForm<QuestionnaireTableFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			questionnaireType: initialData?.questionnaireType ?? "",
			link: initialData?.link ?? "",
			sent: initialData?.sent ? new Date(initialData.sent) : new Date(),
			status: initialData?.status ?? "PENDING",
		},
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="flex flex-wrap justify-between">
					<FormField
						control={form.control}
						name="questionnaireType"
						render={({ field }) => (
							<FormItem className="flex w-5/10 flex-col">
								<FormLabel>Type</FormLabel>
								<Popover onOpenChange={setIsPopoverOpen} open={isPopoverOpen}>
									<PopoverTrigger asChild>
										<FormControl>
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
														: "Select type"}
												<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-[--radix-popover-trigger-width] p-0">
										<Command>
											<CommandInput placeholder="Search..." />
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
				<FormField
					control={form.control}
					name="status"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Status</FormLabel>
							<Select defaultValue={field.value} onValueChange={field.onChange}>
								<FormControl>
									<SelectTrigger>
										<SelectValue placeholder="Select a verified email to display" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="PENDING">Pending</SelectItem>
									<SelectItem value="COMPLETED">Completed</SelectItem>
									<SelectItem value="RESCHEDULED">Rescheduled</SelectItem>
								</SelectContent>
							</Select>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="flex justify-end gap-2">
					<Button disabled={isLoading || isLoadingList} type="submit">
						{newQ
							? "Add Questionnaire"
							: isLoading
								? "Saving..."
								: "Save Changes"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
