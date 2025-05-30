"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/app/_components/ui/button";
import { Calendar } from "~/app/_components/ui/calendar";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "~/app/_components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/app/_components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/app/_components/ui/select";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
	evaluator: z.string(),
	office: z.string(),
	daeval: z.string(),
	date: z.date(),
});

export default function SearchForm() {
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
		url.searchParams.set("eval", encodeURIComponent(values.evaluator));
		url.searchParams.set("office", encodeURIComponent(values.office));
		url.searchParams.set("daeval", encodeURIComponent(values.daeval));
		url.searchParams.set("date", formatISO(values.date));
		url.searchParams.delete("search");
		window.location.href = url.toString();
	}

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(onSubmit)}
				className="w-full space-y-6 sm:w-2/3"
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
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger className="w-60">
												<SelectValue placeholder="John Doe" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{evaluators.data?.map((evaluator) => (
												<SelectItem key={evaluator.npi} value={evaluator.npi}>
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
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger className="w-60">
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
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<FormControl>
											<SelectTrigger className="w-60">
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
													variant={"outline"}
													className={cn(
														"w-[240px] pl-3 text-left font-normal",
														!field.value && "text-muted-foreground",
													)}
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
										<PopoverContent className="w-auto p-0" align="start">
											<Calendar
												mode="single"
												selected={field.value}
												onSelect={field.onChange}
												disabled={(date) => {
													const yesterday = new Date();
													yesterday.setDate(yesterday.getDate() - 1);
													return date < yesterday;
												}}
												initialFocus
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
						type="button"
						onClick={() => {
							const url = new URL(window.location.href);
							url.searchParams.delete("eval");
							url.searchParams.delete("office");
							window.location.href = url.toString();
						}}
					>
						Reset
					</Button>
				</div>
			</form>
		</Form>
	);
}
