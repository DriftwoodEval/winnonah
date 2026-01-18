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
	AlertDialogTrigger,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@ui/form";
import { Input } from "@ui/input";
import { Separator } from "@ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type Control,
	type FieldArrayPath,
	type FieldValues,
	type Path,
	type UseFieldArrayReturn,
	type UseFormReturn,
	useFieldArray,
	useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	pythonConfigSchema,
	serviceSchema,
	serviceWithAdminSchema,
} from "~/lib/validations";
import { api } from "~/trpc/react";

// --- Types & Schema Helpers ---

const keyVal = <V extends z.ZodTypeAny>(val: V) =>
	z.object({ key: z.string().min(1), value: val });
const arrItem = <V extends z.ZodTypeAny>(val: V) => z.object({ value: val });

// Helper types for strict typing
type KV<T> = { key: string; value: T };

const formSchema = z.object({
	config: z.object({
		initials: z.string(),
		name: z.string(),
		email: z.string().email(),
		automated_email: z.string().email(),
		qreceive_emails: z.array(arrItem(z.string().email())),
		punch_list_id: z.string(),
		punch_list_range: z.string(),
		failed_sheet_id: z.string(),
		payroll_folder_id: z.string(),
		database_url: z.string(),
		excluded_ta: z.array(arrItem(z.string())),
		records_folder_id: z.string(),
		sent_records_folder_id: z.string(),
		records_emails: z.array(
			keyVal(z.object({ email: z.string().email(), fax: z.boolean() })),
		),
		piecework: z.object({
			costs: z.array(
				keyVal(
					z.object({
						DA: z.number().optional(),
						EVAL: z.number().optional(),
						DAEVAL: z.number().optional(),
						REPORT: z.number().optional(),
					}),
				),
			),
			name_map: z.array(keyVal(z.string())),
		}),
	}),
	services: z.object({
		openphone: z.object({
			key: z.string(),
			main_number: z.string(),
			users: z.array(keyVal(z.object({ id: z.string(), phone: z.string() }))),
		}),
		therapyappointment: serviceWithAdminSchema,
		mhs: serviceSchema,
		qglobal: serviceSchema,
		wps: serviceSchema,
	}),
});

type FormValues = z.infer<typeof formSchema>;

// --- Transformations ---

const toEntries = <T,>(rec: Record<string, T>): KV<T>[] =>
	Object.entries(rec).map(([key, value]) => ({ key, value }));
const fromEntries = <T,>(arr: KV<T>[]): Record<string, T> =>
	arr.reduce(
		(acc, { key, value }) => {
			acc[key] = value;
			return acc;
		},
		{} as Record<string, T>,
	);

// --- Reusable Generic Components (The "Engine") ---

function FieldInput<T extends FieldValues>({
	control,
	name,
	label,
	type,
	placeholder,
	className,
}: {
	control: Control<T>;
	name: Path<T>;
	label?: string;
	type?: string;
	placeholder?: string;
	className?: string;
}) {
	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className={className}>
					{label && <FormLabel>{label}</FormLabel>}
					<FormControl>
						<Input
							{...field}
							placeholder={placeholder}
							type={type}
							value={field.value?.toString() ?? ""}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

function ProtectedFieldInput<T extends FieldValues>({
	control,
	name,
	label,
	type,
	placeholder,
	className,
}: {
	control: Control<T>;
	name: Path<T>;
	label?: string;
	type?: string;
	placeholder?: string;
	className?: string;
}) {
	const [isUnlocked, setIsUnlocked] = useState(false);

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className={className}>
					{label && <FormLabel>{label}</FormLabel>}
					<div className="flex items-center gap-2">
						<FormControl>
							<Input
								{...field}
								disabled={!isUnlocked}
								placeholder={placeholder}
								type={type}
								value={field.value?.toString() ?? ""}
							/>
						</FormControl>
						{!isUnlocked ? (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										className="shrink-0"
										size="icon"
										type="button"
										variant="outline"
									>
										<Lock className="h-4 w-4" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Edit Restricted Field</AlertDialogTitle>
										<AlertDialogDescription>
											This field ({label}) is restricted to prevent accidental
											changes. Are you sure you want to edit it?
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction onClick={() => setIsUnlocked(true)}>
											Unlock
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						) : (
							<Button
								className="shrink-0"
								onClick={() => setIsUnlocked(false)}
								size="icon"
								type="button"
								variant="ghost"
							>
								<LockOpen className="h-4 w-4" />
							</Button>
						)}
					</div>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

function ListEditor<T extends FieldValues, Name extends FieldArrayPath<T>>({
	control,
	name,
	label,
	renderItem,
	newItem,
}: {
	control: Control<T>;
	name: Name;
	label: string;
	renderItem: (index: number) => React.ReactNode;
	newItem: Parameters<UseFieldArrayReturn<T, Name>["append"]>[0];
}) {
	const { fields, append, remove } = useFieldArray({
		control,
		name,
	});

	return (
		<div className="space-y-2">
			<FormLabel>{label}</FormLabel>
			{fields.map((field, i) => (
				<div className="mb-2 flex items-start gap-2" key={field.id}>
					{renderItem(i)}
					<Button
						onClick={() => remove(i)}
						size="icon"
						type="button"
						variant="ghost"
					>
						<Trash2 className="h-4 w-4 text-destructive" />
					</Button>
				</div>
			))}
			<Button
				className="w-full"
				onClick={() => append(newItem)}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus className="mr-2 h-4 w-4" /> Add Item
			</Button>
		</div>
	);
}

function KeyValueList<T extends FieldValues, Name extends FieldArrayPath<T>>({
	control,
	name,
	label,
	keyLabel,
	defaultValue,
	renderValue,
}: {
	control: Control<T>;
	name: Name;
	label: string;
	keyLabel: string;
	defaultValue: unknown;
	renderValue: (prefix: string) => React.ReactNode;
}) {
	return (
		<ListEditor
			control={control}
			label={label}
			name={name}
			newItem={
				{
					key: "",
					value: defaultValue,
				} as Parameters<UseFieldArrayReturn<T, Name>["append"]>[0]
			}
			renderItem={(i) => (
				<>
					<div className="w-1/3">
						<FieldInput
							control={control}
							name={`${name}.${i}.key` as Path<T>}
							placeholder={keyLabel}
						/>
					</div>
					{renderValue(`${name}.${i}.value`)}
				</>
			)}
		/>
	);
}

// --- Main Page Component ---

export function ConfigEditor() {
	const utils = api.useUtils();
	const { data: config, isLoading } = api.pyConfig.get.useQuery();
	const mutation = api.pyConfig.update.useMutation({
		onSuccess: () => {
			toast.success("Saved");
			utils.pyConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});

	const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

	useEffect(() => {
		if (!config) return;
		const { config: c, services: s } = config;

		form.reset({
			config: {
				...c,
				qreceive_emails: c.qreceive_emails.map((value) => ({ value })),
				excluded_ta: c.excluded_ta.map((value) => ({ value })),
				records_emails: toEntries(c.records_emails),
				piecework: {
					costs: toEntries(c.piecework.costs).map((item) => ({
						key: item.key,
						value: {
							DA: item.value.DA ?? undefined,
							EVAL: item.value.EVAL ?? undefined,
							DAEVAL: item.value.DAEVAL ?? undefined,
							REPORT: item.value.REPORT ?? undefined,
						},
					})),
					name_map: toEntries(c.piecework.name_map),
				},
			},
			services: {
				...s,
				openphone: { ...s.openphone, users: toEntries(s.openphone.users) },
			},
		});
	}, [config, form]);

	const onSubmit = (data: FormValues) => {
		try {
			mutation.mutate(
				pythonConfigSchema.parse({
					config: {
						...data.config,
						qreceive_emails: data.config.qreceive_emails.map((v) => v.value),
						excluded_ta: data.config.excluded_ta.map((v) => v.value),
						records_emails: fromEntries(data.config.records_emails),
						piecework: {
							costs: fromEntries(data.config.piecework.costs),
							name_map: fromEntries(data.config.piecework.name_map),
						},
					},
					services: {
						...data.services,
						openphone: {
							...data.services.openphone,
							users: fromEntries(data.services.openphone.users),
						},
					},
				}),
			);
		} catch (e) {
			toast.error(`Validation failed: ${e}`);
		}
	};

	if (isLoading)
		return <Loader2 className="mx-auto mt-20 h-8 w-8 animate-spin" />;

	return (
		<div className="container max-w-5xl space-y-6 py-8">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-3xl">Configuration</h1>
				<Button
					disabled={mutation.isPending}
					onClick={form.handleSubmit(onSubmit)}
				>
					{mutation.isPending && (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					)}{" "}
					Save
				</Button>
			</div>
			<Form {...form}>
				<Tabs className="w-full" defaultValue="general">
					<TabsList className="grid w-full grid-cols-4">
						{["General", "Services", "Records", "Piecework"].map((t) => (
							<TabsTrigger key={t} value={t.toLowerCase()}>
								{t}
							</TabsTrigger>
						))}
					</TabsList>
					<div className="mt-6 space-y-6">
						<TabsContent value="general">
							<GeneralTab form={form} />
						</TabsContent>
						<TabsContent value="services">
							<ServicesTab form={form} />
						</TabsContent>
						<TabsContent value="records">
							<RecordsTab form={form} />
						</TabsContent>
						<TabsContent value="piecework">
							<PieceworkTab form={form} />
						</TabsContent>
					</div>
				</Tabs>
			</Form>
		</div>
	);
}

// --- Tab Components ---

function GeneralTab({ form }: { form: UseFormReturn<FormValues> }) {
	const c = form.control;
	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Identity</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<FieldInput control={c} label="Initials" name="config.initials" />
					<FieldInput control={c} label="Name" name="config.name" />
					<FieldInput control={c} label="Email" name="config.email" />
					<FieldInput
						control={c}
						label="Bot Email"
						name="config.automated_email"
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>System</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<ProtectedFieldInput
						control={c}
						label="Punch List ID"
						name="config.punch_list_id"
					/>
					<FieldInput
						control={c}
						label="Punch List Range"
						name="config.punch_list_range"
					/>
					<ProtectedFieldInput
						control={c}
						label="Failed Sheet ID"
						name="config.failed_sheet_id"
					/>
					<FieldInput
						control={c}
						label="Payroll Folder ID"
						name="config.payroll_folder_id"
					/>
					<ProtectedFieldInput
						className="col-span-2"
						control={c}
						label="DB URL"
						name="config.database_url"
					/>
				</CardContent>
			</Card>
			<div className="grid grid-cols-2 gap-6">
				<ListEditor
					control={c}
					label="Q-Receive Emails"
					name="config.qreceive_emails"
					newItem={{ value: "" }}
					renderItem={(i) => (
						<FieldInput
							className="w-full"
							control={c}
							name={`config.qreceive_emails.${i}.value` as Path<FormValues>}
						/>
					)}
				/>
				<ListEditor
					control={c}
					label="Excluded TA"
					name="config.excluded_ta"
					newItem={{ value: "" }}
					renderItem={(i) => (
						<FieldInput
							className="w-full"
							control={c}
							name={`config.excluded_ta.${i}.value` as Path<FormValues>}
						/>
					)}
				/>
			</div>
		</div>
	);
}

function ServicesTab({ form }: { form: UseFormReturn<FormValues> }) {
	const c = form.control;
	const commonServices = ["mhs", "qglobal", "wps"] as const;

	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>TherapyAppointment</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<FieldInput
						control={c}
						label="User"
						name="services.therapyappointment.username"
					/>
					<FieldInput
						control={c}
						label="Pass"
						name="services.therapyappointment.password"
						type="password"
					/>
					<FieldInput
						control={c}
						label="Admin User"
						name="services.therapyappointment.admin_username"
					/>
					<FieldInput
						control={c}
						label="Admin Pass"
						name="services.therapyappointment.admin_password"
						type="password"
					/>
				</CardContent>
			</Card>
			<div className="grid grid-cols-3 gap-4">
				{commonServices.map((svc) => (
					<Card key={svc}>
						<CardHeader>
							<CardTitle className="uppercase">{svc}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<FieldInput
								control={c}
								label="User"
								name={`services.${svc}.username`}
							/>
							<FieldInput
								control={c}
								label="Pass"
								name={`services.${svc}.password`}
								type="password"
							/>
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>OpenPhone</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<ProtectedFieldInput
							control={c}
							label="API Key"
							name="services.openphone.key"
						/>
						<ProtectedFieldInput
							control={c}
							label="Main #"
							name="services.openphone.main_number"
						/>
					</div>
					<Separator />
					<KeyValueList
						control={c}
						defaultValue={{ id: "", phone: "" }}
						keyLabel="Name"
						label="Users"
						name="services.openphone.users"
						renderValue={(p) => (
							<div className="grid flex-1 grid-cols-2 gap-2">
								<FieldInput
									control={c}
									name={`${p}.id` as Path<FormValues>}
									placeholder="ID"
								/>
								<FieldInput
									control={c}
									name={`${p}.phone` as Path<FormValues>}
									placeholder="Phone"
								/>
							</div>
						)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function RecordsTab({ form }: { form: UseFormReturn<FormValues> }) {
	return (
		<div className="grid gap-6">
			<Card>
				<CardContent className="grid grid-cols-2 gap-4 pt-6">
					<ProtectedFieldInput
						control={form.control}
						label="Records Folder ID"
						name="config.records_folder_id"
					/>
					<ProtectedFieldInput
						control={form.control}
						label="Sent Folder ID"
						name="config.sent_records_folder_id"
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Emails Map</CardTitle>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue={{ email: "", fax: false }}
						keyLabel="Identifier"
						label=""
						name="config.records_emails"
						renderValue={(p) => (
							<div className="flex flex-1 items-center gap-2">
								<FieldInput
									className="flex-1"
									control={form.control}
									name={`${p}.email` as Path<FormValues>}
									placeholder="Email"
								/>
								<FormField
									control={form.control}
									name={`${p}.fax` as Path<FormValues>}
									render={({ field }) => (
										<FormItem className="flex items-center gap-2 space-y-0">
											<FormControl>
												<Input
													checked={field.value as boolean}
													className="h-4 w-4"
													onChange={field.onChange}
													type="checkbox"
												/>
											</FormControl>
											<FormLabel>Fax?</FormLabel>
										</FormItem>
									)}
								/>
							</div>
						)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function PieceworkTab({ form }: { form: UseFormReturn<FormValues> }) {
	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Costs</CardTitle>
					<CardDescription>Per evaluator rates</CardDescription>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue={{}}
						keyLabel="Evaluator"
						label=""
						name="config.piecework.costs"
						renderValue={(p) => (
							<div className="grid flex-1 grid-cols-4 gap-2">
								{["DA", "EVAL", "DAEVAL", "REPORT"].map((k) => (
									<FormField
										control={form.control}
										key={k}
										name={`${p}.${k}` as Path<FormValues>}
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-[10px]">{k}</FormLabel>
												<FormControl>
													<Input
														step="0.01"
														type="number"
														{...field}
														onChange={(e) =>
															field.onChange(
																e.target.valueAsNumber || undefined,
															)
														}
														value={field.value as number | string}
													/>
												</FormControl>
											</FormItem>
										)}
									/>
								))}
							</div>
						)}
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Name Map</CardTitle>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue=""
						keyLabel="Initials"
						label=""
						name="config.piecework.name_map"
						renderValue={(p) => (
							<FieldInput
								control={form.control}
								name={p as Path<FormValues>}
								placeholder="Full Name"
							/>
						)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
