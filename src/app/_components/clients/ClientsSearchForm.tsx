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
import { CalendarIcon, CheckIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
	CLIENT_COLOR_KEYS,
	CLIENT_COLOR_MAP,
	type ClientColor,
	formatColorName,
} from "~/lib/colors";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const formSchema = z.object({
	evaluator: z.string().optional(),
	office: z.string().optional(),
	type: z.string().optional(),
	date: z.date().optional(),
	color: z.enum(CLIENT_COLOR_KEYS).optional(),
});

interface ClientsSearchFormProps {
	onResetFilters: () => void;
}

function ClientsSearchForm({ onResetFilters }: ClientsSearchFormProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);

	const evaluators = api.evaluators.getAll.useQuery();
	const officesQuery = api.offices.getAll.useQuery();
	const offices = officesQuery.data ?? {};

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			evaluator: searchParams.get("evaluator") ?? undefined,
			office: searchParams.get("office") ?? undefined,
			type: searchParams.get("type") ?? undefined,
			date: searchParams.get("date")
				? parseISO(searchParams.get("date") ?? "")
				: undefined,
			color: (searchParams.get("color") as ClientColor) ?? undefined,
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
		updateParam("color", values.color);

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
			color: undefined,
		});
		onResetFilters();
		router.push(pathname);
	}

	return (
		<Form {...form}>
			<form className="w-full space-y-6 sm:w-2/3">
				<div className="flex flex-col gap-6 sm:flex-row">
					<div className="flex flex-col gap-6">
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
										onValueChange={(value) => {
											field.onChange(value);
											form.handleSubmit(onSubmit)();
										}}
										value={field.value ?? ""}
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
						<FormField
							control={form.control}
							name="color"
							render={({ field }) => (
								<FormItem className="flex flex-col">
									<FormLabel>Color</FormLabel>
									<Popover
										onOpenChange={setIsColorPopoverOpen}
										open={isColorPopoverOpen}
									>
										<PopoverTrigger asChild>
											<FormControl>
												{/** biome-ignore lint/a11y/useSemanticElements: using shadcn */}
												<Button
													className={cn(
														"w-full justify-start sm:w-60",
														!field.value && "text-muted-foreground",
													)}
													role="combobox"
													variant="outline"
												>
													<div className="flex w-full items-center gap-2">
														{field.value ? (
															<div
																className="h-4 w-4 rounded-full border"
																style={{
																	backgroundColor:
																		CLIENT_COLOR_MAP[
																			field.value as ClientColor
																		],
																}}
															/>
														) : null}
														<span className="flex-grow text-left">
															{field.value
																? formatColorName(field.value)
																: "Select a color"}
														</span>
													</div>
												</Button>
											</FormControl>
										</PopoverTrigger>
										<PopoverContent className="w-auto p-2">
											<div className="grid grid-cols-4 place-items-center gap-2">
												{CLIENT_COLOR_KEYS.map((colorKey) => (
													<button
														aria-label={`Select color: ${formatColorName(colorKey)}`}
														className="relative h-10 w-10 rounded-sm"
														key={colorKey}
														onClick={() => {
															const newValue =
																field.value === colorKey ? undefined : colorKey;
															field.onChange(newValue);
															form.handleSubmit(onSubmit)();
															setTimeout(
																() => setIsColorPopoverOpen(false),
																100,
															);
														}}
														style={{
															backgroundColor: CLIENT_COLOR_MAP[colorKey],
														}}
														type="button"
													>
														{field.value === colorKey && (
															<CheckIcon
																className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2"
																style={{
																	color:
																		Number.parseInt(
																			CLIENT_COLOR_MAP[colorKey].replace(
																				"#",
																				"",
																			),
																			16,
																		) >
																		0xffffff / 2
																			? "#333"
																			: "#FFF",
																}}
															/>
														)}
													</button>
												))}
											</div>
										</PopoverContent>
									</Popover>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
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
