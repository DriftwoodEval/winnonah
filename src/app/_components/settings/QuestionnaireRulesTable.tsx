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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api, type RouterOutputs } from "~/trpc/react";

const log = logger.child({ module: "QuestionnaireRulesTable" });

type Rule = RouterOutputs["questionnaires"]["getAllRules"][number];

const DAEVAL_LABELS: Record<string, string> = {
	DA: "DA",
	EVAL: "Eval",
	DAEVAL: "DA+Eval",
};

const DIAGNOSIS_LABELS: Record<string, string> = {
	ASD: "ASD",
	ADHD: "ADHD",
};

const formSchema = z.object({
	daeval: z.enum(["DA", "EVAL", "DAEVAL"]),
	diagnosis: z.enum(["ASD", "ADHD"]).nullable(),
	minAge: z.number().int().min(0),
	maxAge: z.number().int().min(0),
	questionnaires: z
		.array(z.string().min(1))
		.min(1, "At least one questionnaire required"),
});

type FormValues = z.infer<typeof formSchema>;

const ALL_QUESTIONNAIRE_NAMES = [
	"ABAS 3",
	"ASRS (2-5 Years)",
	"ASRS (6-18 Years)",
	"BASC Adolescent",
	"BASC Child",
	"BASC Preschool",
	"CAARS 2",
	"CAT-Q",
	"Conners 4",
	"Conners 4 Self",
	"Conners EC",
	"DP-4",
	"PAI",
	"SRS Self",
	"SRS-2",
	"Vineland",
];

interface RuleFormProps {
	initialData?: Rule;
	onSubmit: (values: FormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

function RuleForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: RuleFormProps) {
	const isEditing = !!initialData;
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: initialData
			? {
					daeval: initialData.daeval,
					diagnosis: initialData.diagnosis,
					minAge: initialData.minAge,
					maxAge: initialData.maxAge,
					questionnaires: initialData.questionnaires,
				}
			: {
					daeval: "DAEVAL",
					diagnosis: null,
					minAge: 0,
					maxAge: 17,
					questionnaires: [],
				},
	});

	const daevalValue = form.watch("daeval");

	const questionnaireOptions = useMemo(
		() => ALL_QUESTIONNAIRE_NAMES.map((n) => ({ label: n, value: n })),
		[],
	);

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="daeval"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Appointment Type</FormLabel>
								<Select
									onValueChange={(v) => {
										field.onChange(v);
										if (v === "DAEVAL") form.setValue("diagnosis", null);
									}}
									value={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="DA">DA</SelectItem>
										<SelectItem value="EVAL">Eval</SelectItem>
										<SelectItem value="DAEVAL">DA+Eval</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="diagnosis"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Diagnosis</FormLabel>
								<Select
									disabled={daevalValue === "DAEVAL"}
									onValueChange={(v) => field.onChange(v === "null" ? null : v)}
									value={field.value ?? "null"}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue
												placeholder={
													daevalValue === "DAEVAL" ? "N/A" : "Select"
												}
											/>
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{daevalValue !== "DAEVAL" && (
											<>
												<SelectItem value="ASD">ASD</SelectItem>
												<SelectItem value="ADHD">ADHD</SelectItem>
											</>
										)}
										{daevalValue === "DAEVAL" && (
											<SelectItem value="null">N/A</SelectItem>
										)}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="minAge"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Min Age (inclusive)</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										min={0}
										type="number"
										{...field}
										onChange={(e) =>
											field.onChange(parseInt(e.target.value, 10))
										}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="maxAge"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Max Age (inclusive)</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										min={0}
										type="number"
										{...field}
										onChange={(e) =>
											field.onChange(parseInt(e.target.value, 10))
										}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="questionnaires"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Questionnaires</FormLabel>
							<FormControl>
								<MultipleSelector
									badgeClassName="bg-secondary text-secondary-foreground"
									creatable={true}
									emptyIndicator={
										<p className="text-center text-muted-foreground text-sm">
											No questionnaires found. Type to add one.
										</p>
									}
									onChange={(options) =>
										field.onChange(options.map((o) => o.value))
									}
									options={questionnaireOptions}
									placeholder="Add questionnaires..."
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

				<div className="flex justify-end gap-2 pt-2">
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

function AddRuleButton() {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const createRule = api.questionnaires.createRule.useMutation({
		onSuccess: () => {
			toast.success("Rule created");
			utils.questionnaires.getAllRules.invalidate();
			setIsOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to create rule", { description: error.message });
		},
	});

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" /> Add Rule
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Add Questionnaire Rule</DialogTitle>
				</DialogHeader>
				<RuleForm
					isLoading={createRule.isPending}
					onClose={() => setIsOpen(false)}
					onSubmit={(values) => createRule.mutate(values)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function RuleActionsMenu({ rule }: { rule: Rule }) {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const utils = api.useUtils();

	const updateRule = api.questionnaires.updateRule.useMutation({
		onSuccess: () => {
			toast.success("Rule updated");
			utils.questionnaires.getAllRules.invalidate();
			setIsEditOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to update rule");
		},
	});

	const deleteRule = api.questionnaires.deleteRule.useMutation({
		onSuccess: () => {
			toast.success("Rule deleted");
			utils.questionnaires.getAllRules.invalidate();
			setIsDeleteOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to delete rule");
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
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={() => setIsEditOpen(true)}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive"
						onClick={() => setIsDeleteOpen(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog onOpenChange={setIsEditOpen} open={isEditOpen}>
				<DialogContent className="sm:max-w-[500px]">
					<DialogHeader>
						<DialogTitle>Edit Questionnaire Rule</DialogTitle>
					</DialogHeader>
					<RuleForm
						initialData={rule}
						isLoading={updateRule.isPending}
						onClose={() => setIsEditOpen(false)}
						onSubmit={(values) => updateRule.mutate({ ...values, id: rule.id })}
					/>
				</DialogContent>
			</Dialog>

			<AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this rule.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive"
							onClick={() => deleteRule.mutate({ id: rule.id })}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export default function QuestionnaireRulesTable() {
	const can = useCheckPermission();
	const canEdit = can("settings:questionnaireRules");
	const { data: rules, isLoading } = api.questionnaires.getAllRules.useQuery();

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<div>
					<h3 className="font-bold text-lg">Questionnaire Rules</h3>
					<p className="text-muted-foreground text-sm">
						Which questionnaires to send based on appointment type, diagnosis,
						and age. ASD+ADHD combines ASD and ADHD rules automatically.
					</p>
				</div>
				{canEdit && <AddRuleButton />}
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{canEdit && <TableHead className="w-[50px]" />}
							<TableHead>Appt Type</TableHead>
							<TableHead>Diagnosis</TableHead>
							<TableHead>Age Range</TableHead>
							<TableHead>Questionnaires</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading &&
							Array.from({ length: 6 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: just a skeleton
								<TableRow key={i}>
									{canEdit && (
										<TableCell>
											<Skeleton className="h-8 w-8" />
										</TableCell>
									)}
									<TableCell>
										<Skeleton className="h-5 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-12" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-12" />
									</TableCell>
									<TableCell>
										<div className="flex gap-1">
											<Skeleton className="h-5 w-20" />
											<Skeleton className="h-5 w-20" />
										</div>
									</TableCell>
								</TableRow>
							))}
						{!isLoading &&
							rules?.map((rule) => (
								<TableRow key={rule.id}>
									{canEdit && (
										<TableCell>
											<RuleActionsMenu rule={rule} />
										</TableCell>
									)}
									<TableCell>
										<Badge variant="outline">
											{DAEVAL_LABELS[rule.daeval] ?? rule.daeval}
										</Badge>
									</TableCell>
									<TableCell>
										{rule.diagnosis ? (
											<Badge variant="secondary">
												{DIAGNOSIS_LABELS[rule.diagnosis] ?? rule.diagnosis}
											</Badge>
										) : (
											<span className="text-muted-foreground text-sm italic">
												Any
											</span>
										)}
									</TableCell>
									<TableCell className="whitespace-nowrap">
										{rule.minAge}–{rule.maxAge === 150 ? "∞" : rule.maxAge}
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{rule.questionnaires.map((q) => (
												<Badge key={q} variant="secondary">
													{q}
												</Badge>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						{!isLoading && rules?.length === 0 && (
							<TableRow>
								<TableCell
									className="h-24 text-center"
									colSpan={canEdit ? 5 : 4}
								>
									No rules configured.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
