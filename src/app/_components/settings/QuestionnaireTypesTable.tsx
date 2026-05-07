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
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api, type RouterOutputs } from "~/trpc/react";

const log = logger.child({ module: "QuestionnaireTypesTable" });

type QType = RouterOutputs["questionnaires"]["getAllTypes"][number];

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	site: z.string().min(1, "Site is required"),
	minAge: z.number().int().min(0),
	maxAge: z.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

interface TypeFormProps {
	initialData?: QType;
	onSubmit: (values: FormValues) => void;
	isLoading: boolean;
	onClose: () => void;
}

function TypeForm({
	initialData,
	onSubmit,
	isLoading,
	onClose,
}: TypeFormProps) {
	const isEditing = !!initialData;
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: initialData
			? {
					name: initialData.name,
					site: initialData.site,
					minAge: initialData.minAge,
					maxAge: initialData.maxAge,
				}
			: { name: "", site: "", minAge: 0, maxAge: 17 },
	});

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										placeholder="e.g. Conners 4"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="site"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Site / Platform</FormLabel>
								<FormControl>
									<Input
										disabled={isLoading}
										placeholder="e.g. MHS"
										{...field}
									/>
								</FormControl>
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

function AddTypeButton() {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const createType = api.questionnaires.createType.useMutation({
		onSuccess: () => {
			toast.success("Questionnaire type created");
			utils.questionnaires.getAllTypes.invalidate();
			setIsOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to create type", { description: error.message });
		},
	});

	return (
		<Dialog onOpenChange={setIsOpen} open={isOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" /> Add Type
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[450px]">
				<DialogHeader>
					<DialogTitle>Add Questionnaire Type</DialogTitle>
				</DialogHeader>
				<TypeForm
					isLoading={createType.isPending}
					onClose={() => setIsOpen(false)}
					onSubmit={(values) => createType.mutate(values)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function TypeActionsMenu({ qtype }: { qtype: QType }) {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const utils = api.useUtils();

	const updateType = api.questionnaires.updateType.useMutation({
		onSuccess: () => {
			toast.success("Questionnaire type updated");
			utils.questionnaires.getAllTypes.invalidate();
			setIsEditOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to update type");
		},
	});

	const deleteType = api.questionnaires.deleteType.useMutation({
		onSuccess: () => {
			toast.success("Questionnaire type deleted");
			utils.questionnaires.getAllTypes.invalidate();
			setIsDeleteOpen(false);
		},
		onError: (error) => {
			log.error(error);
			toast.error("Failed to delete type");
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
				<DialogContent className="sm:max-w-[450px]">
					<DialogHeader>
						<DialogTitle>Edit Questionnaire Type</DialogTitle>
					</DialogHeader>
					<TypeForm
						initialData={qtype}
						isLoading={updateType.isPending}
						onClose={() => setIsEditOpen(false)}
						onSubmit={(values) =>
							updateType.mutate({ ...values, id: qtype.id })
						}
					/>
				</DialogContent>
			</Dialog>

			<AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete this questionnaire type.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive"
							onClick={() => deleteType.mutate({ id: qtype.id })}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

export default function QuestionnaireTypesTable() {
	const can = useCheckPermission();
	const canEdit = can("settings:questionnaireRules");
	const { data: types, isLoading } = api.questionnaires.getAllTypes.useQuery();

	return (
		<div className="px-4">
			<div className="flex items-center justify-between pb-4">
				<div>
					<h3 className="font-bold text-lg">Questionnaire Types</h3>
					<p className="text-muted-foreground text-sm">
						Available questionnaire types and the age ranges they can be
						manually selected for.
					</p>
				</div>
				{canEdit && <AddTypeButton />}
			</div>
			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							{canEdit && <TableHead className="w-[50px]" />}
							<TableHead>Name</TableHead>
							<TableHead>Site</TableHead>
							<TableHead>Age Range</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading &&
							Array.from({ length: 5 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: just a skeleton
								<TableRow key={i}>
									{canEdit && (
										<TableCell>
											<Skeleton className="h-8 w-8" />
										</TableCell>
									)}
									<TableCell>
										<Skeleton className="h-5 w-28" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-5 w-12" />
									</TableCell>
								</TableRow>
							))}
						{!isLoading &&
							types?.map((qtype) => (
								<TableRow key={qtype.id}>
									{canEdit && (
										<TableCell>
											<TypeActionsMenu qtype={qtype} />
										</TableCell>
									)}
									<TableCell className="font-medium">
										<Badge variant="outline">{qtype.name}</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{qtype.site}
									</TableCell>
									<TableCell className="whitespace-nowrap">
										{qtype.minAge}–
										{qtype.maxAge === 150 || qtype.maxAge >= 99
											? "∞"
											: qtype.maxAge}
									</TableCell>
								</TableRow>
							))}
						{!isLoading && types?.length === 0 && (
							<TableRow>
								<TableCell
									className="h-24 text-center"
									colSpan={canEdit ? 4 : 3}
								>
									No questionnaire types configured.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
