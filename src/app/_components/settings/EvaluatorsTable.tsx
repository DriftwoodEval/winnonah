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
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { checkRole } from "~/lib/utils";
import type { Evaluator } from "~/server/lib/types";
import { api } from "~/trpc/react";

const log = logger.child({ module: "EvaluatorsTable" });

const INSURANCE_DISPLAY_NAMES: { [key: string]: string } = {
	SCM: "SCM",
	BabyNet: "BabyNet",
	Molina: "Molina",
	MolinaMarketplace: "Molina Marketplace",
	ATC: "ATC",
	Humana: "Humana",
	SH: "SH",
	HB: "HB",
	Aetna: "Aetna",
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
	Aetna: z.boolean(),
	United_Optum: z.boolean(),
	offices: z.array(z.string()),
	blockedDistricts: z.array(z.number()),
	blockedZips: z.array(
		z.string().regex(/^\d{5}$/, "Must be a 5-digit zip code"),
	),
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

	const { data: allOffices, isLoading: isLoadingOffices } =
		api.offices.getAll.useQuery();
	const { data: allZipCodes, isLoading: isLoadingZipCodes } =
		api.evaluators.getAllZipCodes.useQuery();
	const { data: allSchoolDistricts, isLoading: isLoadingSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();

	const zipCodeOptions = useMemo(() => {
		if (!allZipCodes) return [];
		return allZipCodes.map((zip) => ({ label: zip.zip, value: zip.zip }));
	}, [allZipCodes]);

	const districtOptions = useMemo(() => {
		return (
			allSchoolDistricts?.map((district) => ({
				value: district.id.toString(),
				label: district.shortName,
			})) ?? []
		);
	}, [allSchoolDistricts]);

	const defaultValues = useMemo(() => {
		// If we are editing, populate from initialData
		if (initialData) {
			return {
				npi: initialData.npi.toString(),
				providerName: initialData.providerName,
				email: initialData.email,
				SCM: initialData.SCM,
				BabyNet: initialData.BabyNet,
				Molina: initialData.Molina,
				MolinaMarketplace: initialData.MolinaMarketplace,
				ATC: initialData.ATC,
				Humana: initialData.Humana,
				SH: initialData.SH,
				HB: initialData.HB,
				Aetna: initialData.Aetna,
				United_Optum: initialData.United_Optum,
				offices: initialData.offices.map((office) => office.key),
				blockedDistricts: initialData?.blockedDistricts?.map((d) => d.id) ?? [],
				blockedZips: initialData?.blockedZips?.map((z) => z.zip) ?? [],
			};
		}
		// If creating a new one, provide a complete, empty state
		return {
			npi: "",
			providerName: "",
			email: "",
			SCM: false,
			BabyNet: false,
			Molina: false,
			MolinaMarketplace: false,
			ATC: false,
			Humana: false,
			SH: false,
			HB: false,
			Aetna: false,
			United_Optum: false,
			offices: [],
			blockedDistricts: [],
			blockedZips: [],
		};
	}, [initialData]);

	const form = useForm<EvaluatorFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues,
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
									<FormItem className="flex items-center space-x-2 space-y-0">
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

				<FormField
					control={form.control}
					name="offices"
					render={({ field: _ }) => (
						<FormItem>
							<FormLabel>Offices</FormLabel>
							<div className="flex justify-between gap-4 rounded-md border p-4 sm:justify-center">
								{isLoadingOffices ? (
									<p>Loading offices...</p>
								) : (
									allOffices?.map((office) => (
										<FormField
											control={form.control}
											key={office.key}
											name="offices"
											render={({ field }) => {
												return (
													<FormItem
														className="flex items-center"
														key={office.key}
													>
														<FormControl>
															<Checkbox
																checked={field.value?.includes(office.key)}
																onCheckedChange={(checked) => {
																	return checked
																		? field.onChange([
																				...field.value,
																				office.key,
																			])
																		: field.onChange(
																				field.value?.filter(
																					(value) => value !== office.key,
																				),
																			);
																}}
															/>
														</FormControl>
														<FormLabel className="hidden font-normal sm:block">
															{office.prettyName}
														</FormLabel>
														<FormLabel className="font-normal sm:hidden">
															{office.key}
														</FormLabel>
													</FormItem>
												);
											}}
										/>
									))
								)}
							</div>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="blockedDistricts"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blocked School Districts</FormLabel>
							<FormControl>
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No districts found.
										</p>
									}
									loadingIndicator={
										isLoadingSchoolDistricts ? (
											<p className="text-center text-muted-foreground text-sm">
												Loading districts...
											</p>
										) : undefined
									}
									onChange={(options) =>
										field.onChange(options.map((opt) => Number(opt.value)))
									}
									options={districtOptions}
									placeholder="Select districts..."
									value={districtOptions.filter((option) =>
										field.value.includes(Number(option.value)),
									)}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="blockedZips"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Blocked Zip Codes</FormLabel>
							<FormControl>
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									creatable={true}
									defaultOptions={zipCodeOptions}
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No zip codes found. Type to create a new one.
										</p>
									}
									loadingIndicator={
										isLoadingZipCodes ? (
											<p className="text-center text-muted-foreground text-sm">
												Loading zips...
											</p>
										) : undefined
									}
									onChange={(options) =>
										field.onChange(options.map((opt) => opt.value))
									}
									placeholder="Select zip codes..."
									value={field.value.map((zip) => ({
										label: zip,
										value: zip,
									}))}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

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
			log.error(error, "Failed to create evaluator");
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
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const utils = api.useUtils();

	const updateEvaluator = api.evaluators.update.useMutation({
		onSuccess: () => {
			toast.success("Evaluator updated successfully!");
			utils.evaluators.getAll.invalidate();
			setIsEditDialogOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to update evaluator");
			toast.error("Failed to update evaluator", { description: error.message });
		},
	});

	const deleteEvaluator = api.evaluators.delete.useMutation({
		onSuccess: () => {
			toast.success("Evaluator deleted.");
			utils.evaluators.getAll.invalidate();
			setIsDeleteDialogOpen(false);
		},
		onError: (error) => {
			log.error(error, "Failed to delete evaluator");
			toast.error("Failed to delete evaluator", { description: error.message });
		},
	});

	function onEditSubmit(values: EvaluatorFormValues) {
		const updatedValues = { ...values, npi: String(evaluator.npi) };
		updateEvaluator.mutate(updatedValues);
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button className="h-8 w-8 p-0" variant="ghost">
						<span className="sr-only">Open menu</span>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
						Edit
					</DropdownMenuItem>
					{/*  TODO: Should we allow deleting evaluators? Probably archive them */}
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setIsDeleteDialogOpen(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
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

			<AlertDialog
				onOpenChange={setIsDeleteDialogOpen}
				open={isDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete the
							evaluator.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
							onClick={() =>
								deleteEvaluator.mutate({ npi: String(evaluator.npi) })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
			"Aetna",
			"United_Optum",
		];
		return insurances.filter((p) => evaluator[p]);
	};

	// Helper for loading/empty states to avoid repetition
	const renderTableMessage = (message: string) => (
		<TableRow>
			<TableCell className="h-24 text-center" colSpan={isAdmin ? 7 : 6}>
				{message}
			</TableCell>
		</TableRow>
	);

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<h3 className="font-bold text-lg">Evaluators</h3>
				{isAdmin && <AddEvaluatorButton />}
			</div>
			{/* Table for Medium Screens and Up (md:) */}
			<div className="hidden md:block">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							{isAdmin && <TableHead className="w-[50px]"></TableHead>}
							<TableHead>NPI</TableHead>
							<TableHead>Provider Name</TableHead>
							<TableHead className="hidden lg:table-cell">Email</TableHead>
							<TableHead>Insurance</TableHead>
							<TableHead>Blocked Areas</TableHead>
							<TableHead>Offices</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading
							? renderTableMessage("Loading evaluators...")
							: evaluators && evaluators.length > 0
								? evaluators.map((evaluator) => (
										<TableRow
											className="hover:bg-transparent"
											key={evaluator.npi}
										>
											{isAdmin && (
												<TableCell>
													<EvaluatorActionsMenu evaluator={evaluator} />
												</TableCell>
											)}
											<TableCell className="font-medium">
												{evaluator.npi}
											</TableCell>
											<TableCell>{evaluator.providerName}</TableCell>
											<TableCell className="hidden lg:table-cell xl:hidden">
												<Tooltip>
													<TooltipTrigger asChild>
														<Link
															className="hover:underline"
															href={`mailto:${evaluator.email}`}
														>
															{evaluator.email.split("@")[0]}
															<span className="text-muted-foreground">
																@...
															</span>
														</Link>
													</TooltipTrigger>
													<TooltipContent>{evaluator.email}</TooltipContent>
												</Tooltip>
											</TableCell>
											<TableCell className="hidden xl:table-cell">
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
											<TableCell>
												{evaluator.blockedDistricts?.length === 0 &&
												evaluator.blockedZips?.length === 0 ? (
													<span className="text-muted-foreground">None</span>
												) : (
													<div className="flex flex-wrap gap-1">
														{evaluator.blockedDistricts?.map((district) => (
															<Badge
																key={`dist-${district.id}`}
																variant="destructive"
															>
																{district.shortName}
															</Badge>
														))}
														{evaluator.blockedZips?.map((zip) => (
															<Badge
																key={`zip-${zip.zip}`}
																variant="destructive"
															>
																{zip.zip}
															</Badge>
														))}
													</div>
												)}
											</TableCell>
											<TableCell>
												{evaluator.offices?.length === 0 && (
													<span className="text-muted-foreground text-sm">
														None
													</span>
												)}
												<div className="flex flex-wrap gap-1">
													{evaluator.offices?.map((office) => (
														<Badge key={office.key} variant="secondary">
															{office.prettyName}
														</Badge>
													))}
												</div>
											</TableCell>
										</TableRow>
									))
								: renderTableMessage("No evaluators found.")}
					</TableBody>
				</Table>
			</div>
			{/* Card Layout for Small Screens (mobile) */}
			<div className="grid grid-cols-1 gap-4 md:hidden">
				{isLoading ? (
					<p className="text-center">Loading evaluators...</p>
				) : evaluators && evaluators.length > 0 ? (
					evaluators.map((evaluator) => (
						<div
							className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
							key={evaluator.npi}
						>
							<div className="flex items-start justify-between">
								<div className="space-y-1">
									<h4 className="font-semibold">{evaluator.providerName}</h4>
									<p className="text-muted-foreground text-sm">
										NPI: {evaluator.npi}
									</p>
									<Link
										className="text-primary text-sm hover:underline"
										href={`mailto:${evaluator.email}`}
									>
										{evaluator.email}
									</Link>
								</div>
								{isAdmin && <EvaluatorActionsMenu evaluator={evaluator} />}
							</div>
							<div>
								<h5 className="mb-1 font-medium text-sm">Insurance</h5>
								<div className="flex flex-wrap gap-1">
									{getActiveInsurance(evaluator).map((insurance) => (
										<Badge key={insurance} variant="secondary">
											{INSURANCE_DISPLAY_NAMES[insurance]}
										</Badge>
									))}
								</div>
							</div>
							<div>
								<h5 className="mb-1 font-medium text-sm">Blocked Areas</h5>
								{evaluator.blockedDistricts?.length === 0 &&
								evaluator.blockedZips?.length === 0 ? (
									<span className="text-muted-foreground text-sm">None</span>
								) : (
									<div className="flex flex-wrap gap-1">
										{evaluator.blockedDistricts?.map((district) => (
											<Badge
												key={`dist-card-${district.id}`}
												variant="destructive"
											>
												{district.shortName}
											</Badge>
										))}
										{evaluator.blockedZips?.map((zip) => (
											<Badge key={`zip-card-${zip.zip}`} variant="destructive">
												{zip.zip}
											</Badge>
										))}
									</div>
								)}
							</div>
							<div>
								<h5 className="mb-1 font-medium text-sm">Offices</h5>
								{evaluator.offices?.length === 0 && (
									<span className="text-muted-foreground text-sm">None</span>
								)}
								<div className="flex flex-wrap gap-1">
									{evaluator.offices?.map((office) => (
										<Badge
											key={`office-card-${office.key}`}
											variant="secondary"
										>
											{office.prettyName}
										</Badge>
									))}
								</div>
							</div>
						</div>
					))
				) : (
					<p className="text-center text-muted-foreground">
						No evaluators found.
					</p>
				)}
			</div>
		</div>
	);
}
