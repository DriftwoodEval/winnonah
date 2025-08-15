"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { MoreHorizontal } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { checkRole } from "~/lib/utils";
import type { Evaluator } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";

const INSURANCE_DISPLAY_NAMES: { [key: string]: string } = {
	SCM: "SCM",
	BabyNet: "BabyNet",
	Molina: "Molina",
	MolinaMarketplace: "Molina Marketplace",
	ATC: "ATC",
	Humana: "Humana",
	SH: "SH",
	HB: "HB",
	AETNA: "Aetna",
	United_Optum: "United/Optum",
} as const;

const formSchema = z.object({
	npi: z.string().length(10, {
		message: "NPI must be exactly 10 digits.",
	}),
	providerName: z.string().min(1, { message: "Provider name is required." }),
	email: z.email(),
	SCM: z.boolean(),
	BabyNet: z.boolean(),
	Molina: z.boolean(),
	MolinaMarketplace: z.boolean(),
	ATC: z.boolean(),
	Humana: z.boolean(),
	SH: z.boolean(),
	HB: z.boolean(),
	AETNA: z.boolean(),
	United_Optum: z.boolean(),
	districts: z.string(),
	offices: z.string(),
});

type EvaluatorFormValues = z.infer<typeof formSchema>;

interface EvaluatorFormProps {
	initialData?: Evaluator;
	onSubmit: (values: EvaluatorFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

function EvaluatorForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: EvaluatorFormProps) {
	const isEditing = !!initialData;

	const form = useForm<EvaluatorFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			npi: initialData?.npi ? initialData.npi.toString() : "",
			providerName: initialData?.providerName ?? "",
			email: initialData?.email ?? "",
			SCM: initialData?.SCM ?? false,
			BabyNet: initialData?.BabyNet ?? false,
			Molina: initialData?.Molina ?? false,
			MolinaMarketplace: initialData?.MolinaMarketplace ?? false,
			ATC: initialData?.ATC ?? false,
			Humana: initialData?.Humana ?? false,
			SH: initialData?.SH ?? false,
			HB: initialData?.HB ?? false,
			AETNA: initialData?.AETNA ?? false,
			United_Optum: initialData?.United_Optum ?? false,
			districts: initialData?.districts ?? "",
			offices: initialData?.offices ?? "",
		},
	});

	return (
		<Form {...form}>
			<form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="npi"
						render={({ field }) => (
							<FormItem>
								<FormLabel>NPI</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading || isEditing}
										// NPI is the primary key, so it cannot be changed when editing
										placeholder="1234567890"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="providerName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Provider Name</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										placeholder="Jane Doe"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input
									disabled={isLoading}
									placeholder="evaluator@domain.com"
									type="email"
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<div className="space-y-2">
					<FormLabel>Insurance</FormLabel>
					<div className="grid grid-cols-2 gap-4 rounded-md border p-4 sm:grid-cols-3">
						{(
							Object.keys(INSURANCE_DISPLAY_NAMES) as Array<
								keyof EvaluatorFormValues
							>
						).map((insuranceKey) => (
							<FormField
								control={form.control}
								key={insuranceKey}
								name={insuranceKey}
								render={({ field }) => (
									<FormItem className="flex flex-row items-start space-x-3 space-y-0">
										<FormControl>
											<Checkbox
												checked={field.value as boolean}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<FormLabel className="font-normal">
											{INSURANCE_DISPLAY_NAMES[insuranceKey]}
										</FormLabel>
									</FormItem>
								)}
							/>
						))}
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="districts"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Districts</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										placeholder="District 1, District 2"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="offices"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Offices</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										placeholder="Main St Office, Downtown Branch"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex justify-end gap-2 pt-4">
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading
							? "Saving..."
							: isEditing
								? "Save Changes"
								: "Create Evaluator"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function AddEvaluatorButton() {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const utils = api.useUtils();

	const createEvaluator = api.evaluators.create.useMutation({
		onSuccess: () => {
			toast.success("Evaluator created successfully!");
			utils.evaluators.getAll.invalidate();
			setIsDialogOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to create evaluator", {
				description: error.message,
			});
		},
	});

	function onSubmit(values: EvaluatorFormValues) {
		createEvaluator.mutate(values);
	}

	return (
		<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<span className="hidden sm:block">Add Evaluator</span>
					<span className="sm:hidden">Add</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add New Evaluator</DialogTitle>
				</DialogHeader>
				<EvaluatorForm
					isLoading={createEvaluator.isPending}
					onClose={() => setIsDialogOpen(false)}
					onSubmit={onSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
}

function EvaluatorActionsMenu({ evaluator }: { evaluator: Evaluator }) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const utils = api.useUtils();

	const updateEvaluator = api.evaluators.update.useMutation({
		onSuccess: () => {
			toast.success("Evaluator updated successfully!");
			utils.evaluators.getAll.invalidate();
			setIsEditDialogOpen(false);
		},
		onError: (error) => {
			toast.error("Failed to update evaluator", { description: error.message });
		},
	});

	const deleteEvaluator = api.evaluators.delete.useMutation({
		onSuccess: () => {
			toast.success("Evaluator deleted.");
			utils.evaluators.getAll.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to delete evaluator", { description: error.message });
		},
	});

	function onEditSubmit(values: EvaluatorFormValues) {
		const updatedValues = { ...values, npi: String(evaluator.npi) };
		updateEvaluator.mutate(updatedValues);
	}

	return (
		<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<span className="sr-only">Open menu</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DialogTrigger asChild>
						<DropdownMenuItem>Edit</DropdownMenuItem>
					</DialogTrigger>
					{/* TODO: Add a delete confirmation dialog */}
					<DropdownMenuItem
						className="text-red-600"
						disabled={deleteEvaluator.isPending}
						onClick={() =>
							deleteEvaluator.mutate({ npi: String(evaluator.npi) })
						}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Evaluator</DialogTitle>
				</DialogHeader>
				<EvaluatorForm
					initialData={evaluator}
					isLoading={updateEvaluator.isPending}
					onClose={() => setIsEditDialogOpen(false)}
					onSubmit={onEditSubmit}
				/>
			</DialogContent>
		</Dialog>
	);
}

export default function EvaluatorsTable() {
	const { data: session } = useSession();
	const isAdmin = session ? checkRole(session.user.role, "admin") : false;
	const { data: evaluators, isLoading } = api.evaluators.getAll.useQuery();

	const getActiveInsurance = (evaluator: Evaluator) => {
		const insurances: (keyof Evaluator)[] = [
			"SCM",
			"BabyNet",
			"Molina",
			"MolinaMarketplace",
			"ATC",
			"Humana",
			"SH",
			"HB",
			"AETNA",
			"United_Optum",
		];
		return insurances.filter((p) => evaluator[p]);
	};

	return (
		<div className="rounded-lg border p-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Evaluators</h3>
				{isAdmin && <AddEvaluatorButton />}
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						{isAdmin && <TableHead className="w-[50px]">Actions</TableHead>}
						<TableHead className="w-[120px]">NPI</TableHead>
						<TableHead>Provider Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Programs</TableHead>
						<TableHead>Blocked Areas</TableHead>
						<TableHead>Offices</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						<TableRow>
							<TableCell className="h-24 text-center" colSpan={6}>
								Loading evaluators...
							</TableCell>
						</TableRow>
					) : evaluators && evaluators.length > 0 ? (
						evaluators.map((evaluator) => (
							<TableRow key={evaluator.npi}>
								{isAdmin && (
									<TableCell>
										<EvaluatorActionsMenu evaluator={evaluator} />
									</TableCell>
								)}
								<TableCell>{evaluator.npi}</TableCell>
								<TableCell>{evaluator.providerName}</TableCell>
								<TableCell>
									<Link
										className="hover:underline"
										href={`mailto:${evaluator.email}`}
									>
										{evaluator.email}
									</Link>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{getActiveInsurance(evaluator).map((insurance) => (
											<Badge key={insurance} variant="secondary">
												{INSURANCE_DISPLAY_NAMES[insurance]}
											</Badge>
										))}
									</div>
								</TableCell>
								<TableCell>{evaluator.districts}</TableCell>
								<TableCell>{evaluator.offices}</TableCell>
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell className="h-24 text-center" colSpan={3}>
								No evaluators found.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
