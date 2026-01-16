"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/alert-dialog";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
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
import MultipleSelector from "@ui/multiple-selector";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Check, MoreHorizontal, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useMediaQuery } from "~/hooks/use-media-query";
import { logger } from "~/lib/logger";
import type { Insurance } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";

const log = logger.child({ module: "InsurancesTable" });

const formSchema = z.object({
	shortName: z.string().min(1, "Short name is required"),
	preAuthNeeded: z.boolean().default(false),
	preAuthLockin: z.boolean().default(false),
	appointmentsRequired: z.number().int().min(1).default(1),
	aliases: z.array(z.string()).default([]),
});

type InsuranceFormValues = z.infer<typeof formSchema>;
type InsuranceFormInput = z.input<typeof formSchema>;

type InsuranceWithAliases = Insurance & { aliases: { name: string }[] };

interface InsuranceFormProps {
	initialData?: InsuranceWithAliases;
	onSubmit: (values: InsuranceFormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

function InsuranceForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: InsuranceFormProps) {
	const isEditing = !!initialData;

	const defaultValues = useMemo(() => {
		if (initialData) {
			return {
				shortName: initialData.shortName,
				preAuthNeeded: initialData.preAuthNeeded,
				preAuthLockin: initialData.preAuthLockin,
				appointmentsRequired: initialData.appointmentsRequired,
				aliases: initialData.aliases.map((a) => a.name),
			};
		}
		return {
			shortName: "",
			preAuthNeeded: false,
			preAuthLockin: false,
			appointmentsRequired: 1,
			aliases: [],
		};
	}, [initialData]);

	const form = useForm<InsuranceFormInput, any, InsuranceFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
	});

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="shortName"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Insurance Name (Short/Canonical)</FormLabel>
							<FormControl>
								<Input disabled={isLoading} placeholder="e.g. SCM" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="aliases"
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								Official Names (Aliases from external systems)
							</FormLabel>
							<FormControl>
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									creatable={true}
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No names found. Type to add an official name.
										</p>
									}
									onChange={(options) =>
										field.onChange(options.map((opt) => opt.value))
									}
									placeholder="Add official names..."
									value={(field.value ?? []).map((name) => ({
										label: name,
										value: name,
									}))}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="appointmentsRequired"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Appointments Required</FormLabel>
							<FormControl>
								<Input
									disabled={isLoading}
									type="number"
									{...field}
									onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="preAuthNeeded"
						render={({ field }) => (
							<FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
								<FormControl>
									<Checkbox
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel className="text-sm">Pre-Auth Needed</FormLabel>
								</div>
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="preAuthLockin"
						render={({ field }) => (
							<FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
								<FormControl>
									<Checkbox
										checked={field.value}
										onCheckedChange={field.onChange}
									/>
								</FormControl>
								<div className="space-y-1 leading-none">
									<FormLabel className="text-sm">Provider Lock In</FormLabel>
								</div>
							</FormItem>
						)}
					/>
				</div>
				<div className="flex justify-end gap-2 pt-4">
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={isLoading} type="submit">
						{isLoading ? "Saving..." : isEditing ? "Save Changes" : "Create"}
					</Button>
				</div>
			</form>
		</Form>
	);
}

function AddInsuranceButton() {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const createInsurance = api.insurances.create.useMutation({
		onSuccess: () => {
			toast.success("Insurance created");
			utils.insurances.getAll.invalidate();
			setIsOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to create insurance", { description: error.message });
		},
	});

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Add Insurance</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle>Add Insurance</DialogTitle>
				</DialogHeader>
				<InsuranceForm
					isLoading={createInsurance.isPending}
					onClose={() => setIsOpen(false)}
					onSubmit={(values) => createInsurance.mutate(values)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function InsuranceActionsMenu({
	insurance,
}: {
	insurance: InsuranceWithAliases;
}) {
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const utils = api.useUtils();
	const isDesktop = useMediaQuery("(min-width: 768px)");

	const updateInsurance = api.insurances.update.useMutation({
		onSuccess: () => {
			toast.success("Insurance updated");
			utils.insurances.getAll.invalidate();
			setIsEditDialogOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to update insurance");
		},
	});

	const deleteInsurance = api.insurances.delete.useMutation({
		onSuccess: () => {
			toast.success("Insurance deleted");
			utils.insurances.getAll.invalidate();
			setIsDeleteDialogOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to delete insurance");
		},
	});

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={isDesktop ? "start" : "end"}>
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setIsDeleteDialogOpen(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>Edit Insurance</DialogTitle>
					</DialogHeader>
					<InsuranceForm
						initialData={insurance}
						isLoading={updateInsurance.isPending}
						onClose={() => setIsEditDialogOpen(false)}
						onSubmit={(values) =>
							updateInsurance.mutate({ ...values, id: insurance.id })
						}
					/>
				</DialogContent>
			</Dialog>

			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this insurance and remove it from all
							evaluators.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive"
							onClick={() => deleteInsurance.mutate({ id: insurance.id })}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export default function InsurancesTable() {
	const { data: session } = useSession();
	const canEdit = session
		? hasPermission(session.user.permissions, "settings:evaluators")
		: false;
	const { data: insurances, isLoading } = api.insurances.getAll.useQuery();

	if (isLoading)
		return <p className="p-4 text-center">Loading insurances...</p>;

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Insurances</h3>
				{canEdit && <AddInsuranceButton />}
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{canEdit && <TableHead className="w-[50px]"></TableHead>}
							<TableHead>Short Name</TableHead>
							<TableHead>Official Names (Aliases)</TableHead>
							<TableHead className="text-center">Pre-Auth</TableHead>
							<TableHead className="text-center">Lock In</TableHead>
							<TableHead className="text-center">Appts.</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{insurances?.map((insurance) => (
							<TableRow key={insurance.id}>
								{canEdit && (
									<TableCell>
										<InsuranceActionsMenu
											insurance={insurance as InsuranceWithAliases}
										/>
									</TableCell>
								)}
								<TableCell className="font-medium">
									<Badge variant="outline">{insurance.shortName}</Badge>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{insurance.aliases.map((alias) => (
											<Badge key={alias.name} variant="secondary">
												{alias.name}
											</Badge>
										))}
										{insurance.aliases.length === 0 && (
											<span className="text-muted-foreground text-sm italic">
												None
											</span>
										)}
									</div>
								</TableCell>
								<TableCell className="text-center">
									{insurance.preAuthNeeded ? (
										<Check className="mx-auto h-4 w-4 text-green-500" />
									) : (
										<X className="mx-auto h-4 w-4 text-muted-foreground" />
									)}
								</TableCell>
								<TableCell className="text-center">
									{insurance.preAuthLockin ? (
										<Check className="mx-auto h-4 w-4 text-green-500" />
									) : (
										<X className="mx-auto h-4 w-4 text-muted-foreground" />
									)}
								</TableCell>
								<TableCell className="text-center">
									{insurance.appointmentsRequired}
								</TableCell>
							</TableRow>
						))}
						{insurances?.length === 0 && (
							<TableRow>
								<TableCell className="h-24 text-center" colSpan={6}>
									No insurances found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
