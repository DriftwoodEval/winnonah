"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import type { TestUnit } from "~/lib/types";
import { api } from "~/trpc/react";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

const testUnitSchema = z.object({
	name: z.string().min(1, "Name is required"),
	minutes: z.number().min(1, "Minutes are required"),
});

type TestUnitFormValues = z.infer<typeof testUnitSchema>;

interface TestUnitEditorProps {
	unit?: { id: number; name: string; minutes: number } | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TestUnitEditor({
	unit,
	open,
	onOpenChange,
}: TestUnitEditorProps) {
	const utils = api.useUtils();
	const isEditing = !!unit;

	const form = useForm<TestUnitFormValues>({
		resolver: zodResolver(testUnitSchema),
		values: {
			name: unit?.name ?? "",
			minutes: unit?.minutes ?? 0,
		},
	});

	const addMutation = api.testUnits.add.useMutation({
		onSuccess: async () => {
			toast.success("Unit added");
			await utils.testUnits.getAll.invalidate();
			onOpenChange(false);
			form.reset();
		},
		onError: (error) => {
			toast.error("Failed to add test", {
				description: error.message,
				duration: 10000,
			});
		},
	});

	const updateMutation = api.testUnits.update.useMutation({
		onSuccess: async () => {
			toast.success("Unit updated");
			await utils.testUnits.getAll.invalidate();
			onOpenChange(false);
			form.reset();
		},
		onError: (error) => {
			toast.error("Failed to update test", {
				description: error.message,
				duration: 10000,
			});
		},
	});

	const onSubmit = (values: TestUnitFormValues) => {
		if (isEditing && unit) {
			updateMutation.mutate({
				id: unit.id,
				...values,
			});
		} else {
			addMutation.mutate(values);
		}
	};

	const isPending = addMutation.isPending || updateMutation.isPending;

	return (
		<ResponsiveDialog
			open={open}
			setOpen={onOpenChange}
			title={isEditing ? "Edit Test" : "Add New Test"}
		>
			<Form {...form}>
				<form className="space-y-4 p-4" onSubmit={form.handleSubmit(onSubmit)}>
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="minutes"
						render={({ field: { onChange, ...field } }) => (
							<FormItem>
								<FormLabel>Default Time (minutes)</FormLabel>
								<FormControl>
									<Input
										type="number"
										{...field}
										onChange={(e) => onChange(e.target.valueAsNumber || 0)}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button className="w-full" disabled={isPending} type="submit">
						{isPending ? "Saving..." : "Save Unit"}
					</Button>
				</form>
			</Form>
		</ResponsiveDialog>
	);
}

export function TestUnitManager() {
	const [managerOpen, setManagerOpen] = useState(false);
	const [editorOpen, setEditorOpen] = useState(false);
	const [selectedUnit, setSelectedUnit] = useState<TestUnit | null>(null);

	const { data: units } = api.testUnits.getAll.useQuery();

	units?.sort((a, b) => a.name.localeCompare(b.name));

	const utils = api.useUtils();
	const deleteMutation = api.testUnits.delete.useMutation({
		onSuccess: () => utils.testUnits.getAll.invalidate(),
	});

	return (
		<>
			<Button onClick={() => setManagerOpen(true)} size="sm" variant="outline">
				Manage Tests
			</Button>

			<ResponsiveDialog
				className="max-w-md"
				open={managerOpen}
				setOpen={setManagerOpen}
				title="Manage Test Units"
			>
				<div className="max-h-[calc(100vh-200px)] space-y-4 overflow-y-auto p-4">
					<Button
						className="w-full justify-start"
						onClick={() => {
							setSelectedUnit(null);
							setEditorOpen(true);
						}}
						variant="secondary"
					>
						<Plus className="mr-2 h-4 w-4" /> Add New Unit
					</Button>

					<div className="divide-y rounded-md border">
						{units?.map((unit) => (
							<div
								className="flex items-center justify-between p-3 hover:bg-muted/50"
								key={unit.id}
							>
								<div>
									<p className="font-medium text-sm">{unit.name}</p>
									<p className="text-muted-foreground text-xs">
										{unit.minutes} mins
									</p>
								</div>
								<div className="flex gap-1">
									<Button
										onClick={() => {
											setSelectedUnit(unit);
											setEditorOpen(true);
										}}
										size="icon"
										variant="ghost"
									>
										<Edit2 className="h-4 w-4" />
									</Button>
									<Button
										className="text-destructive"
										onClick={() => deleteMutation.mutate({ id: unit.id })}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}
					</div>
				</div>
			</ResponsiveDialog>

			<TestUnitEditor
				onOpenChange={setEditorOpen}
				open={editorOpen}
				unit={selectedUnit}
			/>
		</>
	);
}
