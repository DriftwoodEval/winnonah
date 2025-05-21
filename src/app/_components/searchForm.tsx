"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/app/_components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from "~/app/_components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/app/_components/ui/select";
import { api } from "~/trpc/react";

const formSchema = z.object({
	evaluator: z.string().optional(),
	office: z.string().optional(),
});

export default function SearchForm() {
	const searchParams = useSearchParams();
	const evaluators = api.evaluators.getAll.useQuery();
	const officesQuery = api.offices.getAll.useQuery();
	const offices = officesQuery.data ?? {};

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			evaluator: searchParams.get("eval") ?? "",
			office: searchParams.get("office") ?? "",
		},
	});

	function onSubmit(values: z.infer<typeof formSchema>) {
		const url = new URL(window.location.href);
		if (values.evaluator) {
			url.searchParams.set("eval", encodeURIComponent(values.evaluator));
		}
		if (values.office) {
			url.searchParams.set("office", encodeURIComponent(values.office));
		}
		window.location.href = url.toString();
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="w-2/3 space-y-6">
				<FormField
					control={form.control}
					name="evaluator"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Evaluator</FormLabel>
							<Select onValueChange={field.onChange} defaultValue={field.value}>
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
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="office"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Office</FormLabel>
							<Select onValueChange={field.onChange} defaultValue={field.value}>
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
						</FormItem>
					)}
				/>
				<Button type="submit">Search</Button>
			</form>
		</Form>
	);
}
