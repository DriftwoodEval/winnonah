"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { format, formatISO, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
	evaluator: z.string().optional(),
	office: z.string().optional(),
	type: z.string().optional(),
	date: z.date().optional(),
});

interface ClientsSearchFormProps {
	onResetFilters: () => void;
}

function ClientsSearchForm({ onResetFilters }: ClientsSearchFormProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const { data: evaluators } = api.evaluators.getAll.useQuery();
	const { data: offices } = api.offices.getAll.useQuery();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			evaluator: searchParams.get("evaluator") ?? undefined,
			office: searchParams.get("office") ?? undefined,
			type: searchParams.get("type") ?? undefined,
			date: searchParams.get("date")
				? parseISO(searchParams.get("date") ?? "")
				: undefined,
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		const params = new URLSearchParams(searchParams);

		const updateParam = (key: string, value: string | undefined) => {
			if (value) params.set(key, value);
			else params.delete(key);
		};

		updateParam("evaluator", values.evaluator);
		updateParam("office", values.office);
		updateParam("type", values.type);

		if (values.date) {
			params.set("date", formatISO(values.date, { representation: "date" }));
		} else {
			params.delete("date");
		}

		router.push(`${pathname}?${params.toString()}`);
	}

	function handleReset() {
		form.reset({
			evaluator: undefined,
			office: undefined,
			type: undefined,
			date: undefined,
		});
		onResetFilters();
		router.push(pathname);
	}

	return (
		<Form {...form}>
			<form className="w-full space-y-6 lg:w-1/3">
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="evaluator"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Evaluator</FormLabel>
								<Select
									onValueChange={(value) => {
										field.onChange(value);
										form.handleSubmit(onSubmit)();
									}}
									value={field.value ?? ""}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="John Doe" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{evaluators?.map((evaluator) => (
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
									onValueChange={(value) => {
										field.onChange(value);
										form.handleSubmit(onSubmit)();
									}}
									value={field.value ?? ""}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Town" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{offices?.map((office) => (
											<SelectItem key={office.key} value={office.key}>
												{office.prettyName}
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
						name="type"
						render={({ field }) => (
							<FormItem>
								<FormLabel>DA/Eval</FormLabel>
								<Select
									onValueChange={(value) => {
										field.onChange(value);
										form.handleSubmit(onSubmit)();
									}}
									value={field.value ?? ""}
								>
									<FormControl>
										<SelectTrigger className="w-full">
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
													"w-full pl-3 text-left font-normal",
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
											autoFocus
											disabled={(date) => {
												const yesterday = new Date();
												yesterday.setDate(yesterday.getDate() - 1);
												return date < yesterday;
											}}
											mode="single"
											onSelect={(date) => {
												field.onChange(date);
												form.handleSubmit(onSubmit)();
											}}
											selected={field.value}
										/>
									</PopoverContent>
								</Popover>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<div className="flex justify-start gap-3">
					<Button onClick={handleReset} type="button" variant="outline">
						Reset Filters
					</Button>
				</div>
			</form>
		</Form>
	);
}

export default React.memo(ClientsSearchForm);
