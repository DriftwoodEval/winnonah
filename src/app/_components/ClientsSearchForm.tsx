"use client";

import { Button } from "@components/ui/button";
import { Calendar } from "@components/ui/calendar";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
	evaluator: z.string().optional(),
	office: z.string().optional(),
	daeval: z.string().optional(),
	date: z.date().optional(),
});

export default function ClientsSearchForm() {
	const searchParams = useSearchParams();
	const evaluators = api.evaluators.getAll.useQuery();
	const officesQuery = api.offices.getAll.useQuery();
	const offices = officesQuery.data ?? {};

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			evaluator: searchParams.get("eval") ?? undefined,
			office: searchParams.get("office") ?? undefined,
			daeval: searchParams.get("daeval") ?? undefined,
			date: searchParams.get("date")
				? new Date(searchParams.get("date") as string)
				: undefined,
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		const url = new URL(window.location.href);
		if (values.evaluator !== undefined) {
			url.searchParams.set("eval", encodeURIComponent(values.evaluator));
		}
		if (values.office !== undefined) {
			url.searchParams.set("office", encodeURIComponent(values.office));
		}
		if (values.daeval !== undefined) {
			url.searchParams.set("daeval", encodeURIComponent(values.daeval));
		}
		if (values.date !== undefined) {
			url.searchParams.set("date", formatISO(values.date));
		}
		url.searchParams.delete("search");
		window.location.href = url.toString();
	}

	return (
		<Form {...form}>
			<form
				className="w-full space-y-6 sm:w-2/3"
				onSubmit={form.handleSubmit(onSubmit)}
			>
				<div className="flex flex-col gap-6 sm:flex-row">
					<div className="flex flex-col gap-6">
						<FormField
							control={form.control}
							name="evaluator"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Evaluator</FormLabel>
									<Select
										defaultValue={field.value}
										onValueChange={field.onChange}
									>
										<FormControl>
											<SelectTrigger className="w-full sm:w-60">
												<SelectValue placeholder="John Doe" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{evaluators.data?.map((evaluator) => (
												<SelectItem
													key={evaluator.npi}
													value={evaluator.npi.toString()}
												>
													{evaluator.providerName}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="office"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Office</FormLabel>
									<Select
										defaultValue={field.value}
										onValueChange={field.onChange}
									>
										<FormControl>
											<SelectTrigger className="w-full sm:w-60">
												<SelectValue placeholder="Town" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{Object.entries(offices).map(([key, office]) => (
												<SelectItem key={key} value={key}>
													{office.prettyName}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
					<div className="flex flex-col gap-6">
						<FormField
							control={form.control}
							name="daeval"
							render={({ field }) => (
								<FormItem>
									<FormLabel>DA/Eval</FormLabel>
									<Select
										defaultValue={field.value}
										onValueChange={field.onChange}
									>
										<FormControl>
											<SelectTrigger className="w-full sm:w-60">
												<SelectValue placeholder="Appointment Type" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem key="DA" value="DA">
												DA
											</SelectItem>
											<SelectItem key="Eval" value="Eval">
												Eval
											</SelectItem>
											<SelectItem key="DAEval" value="DAEval">
												DA + Eval
											</SelectItem>
											<SelectItem key="ADHDDA" value="ADHDDA">
												ADHD DA
											</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="date"
							render={({ field }) => (
								<FormItem className="flex flex-col">
									<FormLabel>Date</FormLabel>
									<Popover>
										<PopoverTrigger asChild>
											<FormControl>
												<Button
													className={cn(
														"w-full pl-3 text-left font-normal sm:w-60",
														!field.value && "text-muted-foreground",
													)}
													variant={"outline"}
												>
													{field.value ? (
														format(field.value, "PPP")
													) : (
														<span>Pick a date</span>
													)}
													<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent align="start" className="w-auto p-0">
											<Calendar
												disabled={(date) => {
													const yesterday = new Date();
													yesterday.setDate(yesterday.getDate() - 1);
													return date < yesterday;
												}}
												initialFocus
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
				</div>
				<div className="flex justify-center gap-3 sm:justify-start">
					<Button type="submit">Search</Button>
					<Button
						onClick={() => {
							const url = new URL(window.location.href);
							url.searchParams.delete("eval");
							url.searchParams.delete("office");
							url.searchParams.delete("daeval");
							url.searchParams.delete("date");
							url.searchParams.delete("showBabynet");
							window.location.href = url.toString();
						}}
						type="button"
						variant="outline"
					>
						Reset
					</Button>
				</div>
			</form>
		</Form>
	);
}
