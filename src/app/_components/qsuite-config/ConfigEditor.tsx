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
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Info, Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
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
import type { PermissionsObject } from "~/lib/types";
import { cn, hasPermission } from "~/lib/utils";
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
		email: z.email(),
		automated_email: z.email(),
		qreceive_emails: z.array(arrItem(z.email())),
		punch_list_id: z.string(),
		punch_list_range: z.string(),
		failed_sheet_id: z.string(),
		payroll_folder_id: z.string(),
		database_url: z.string(),
		excluded_ta: z.array(arrItem(z.string())),
		records_folder_id: z.string(),
		sent_records_folder_id: z.string(),
		records_emails: z.array(
			keyVal(z.object({ email: z.email(), fax: z.boolean() })),
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
	disabled,
	description,
}: {
	control: Control<T>;
	name: Path<T>;
	label?: string;
	type?: string;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	description?: string;
}) {
	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className={className}>
					<div className="flex items-center gap-2">
						{label && <FormLabel>{label}</FormLabel>}
						{description && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Info className="h-4 w-4 cursor-help text-muted-foreground" />
								</TooltipTrigger>
								<TooltipContent>
									<p className="max-w-xs">{description}</p>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
					<FormControl>
						<Input
							{...field}
							disabled={disabled}
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
	disabled,
	description,
}: {
	control: Control<T>;
	name: Path<T>;
	label?: string;
	type?: string;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	description?: string;
}) {
	const [isUnlocked, setIsUnlocked] = useState(false);

	return (
		<FormField
			control={control}
			name={name}
			render={({ field }) => (
				<FormItem className={className}>
					<div className="flex items-center gap-2">
						{label && <FormLabel>{label}</FormLabel>}
						{description && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Info className="h-4 w-4 cursor-help text-muted-foreground" />
								</TooltipTrigger>
								<TooltipContent>
									<p className="max-w-xs">{description}</p>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
					<div className="flex items-center gap-2">
						<FormControl>
							<Input
								{...field}
								disabled={disabled || !isUnlocked}
								placeholder={placeholder}
								type={type}
								value={field.value?.toString() ?? ""}
							/>
						</FormControl>
						{!isUnlocked ? (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										className={cn(
											"shrink-0 cursor-pointer",
											disabled ?? "cursor-not-allowed",
										)}
										disabled={disabled}
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
								disabled={disabled}
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
	disabled,
	description,
}: {
	control: Control<T>;
	name: Name;
	label: string;
	renderItem: (index: number) => React.ReactNode;
	newItem: Parameters<UseFieldArrayReturn<T, Name>["append"]>[0];
	disabled?: boolean;
	description?: string;
}) {
	const { fields, append, remove } = useFieldArray({
		control,
		name,
	});

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<FormLabel>{label}</FormLabel>
				{description && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Info className="h-4 w-4 cursor-help text-muted-foreground" />
						</TooltipTrigger>
						<TooltipContent>
							<p className="max-w-xs">{description}</p>
						</TooltipContent>
					</Tooltip>
				)}
			</div>
			{fields.map((field, i) => (
				<div className="mb-2 flex w-full items-end gap-2" key={field.id}>
					{renderItem(i)}
					<Button
						disabled={disabled}
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
				disabled={disabled}
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
	keyClassName = "w-1/3",
	disabled,
	description,
}: {
	control: Control<T>;
	name: Name;
	label: string;
	keyLabel: string;
	defaultValue: unknown;
	renderValue: (prefix: string, disabled?: boolean) => React.ReactNode;
	keyClassName?: string;
	disabled?: boolean;
	description?: string;
}) {
	return (
		<ListEditor
			control={control}
			description={description}
			disabled={disabled}
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
					<div className={keyClassName}>
						<FieldInput
							control={control}
							disabled={disabled}
							name={`${name}.${i}.key` as Path<T>}
							placeholder={keyLabel}
						/>
					</div>
					{renderValue(`${name}.${i}.value`, disabled)}
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

	const { data: session } = useSession();
	const perms = session?.user.permissions as PermissionsObject;

	const canEditGeneral = hasPermission(perms, "settings:qsuite:general");
	const canEditServices = hasPermission(perms, "settings:qsuite:services");
	const canEditRecords = hasPermission(perms, "settings:qsuite:records");
	const canEditPiecework = hasPermission(perms, "settings:qsuite:piecework");

	const canEditAny =
		canEditGeneral || canEditServices || canEditRecords || canEditPiecework;

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
		<div className="container mx-auto max-w-5xl space-y-6 py-8">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-3xl">QSuite Config</h1>
				<Button
					disabled={mutation.isPending || !canEditAny}
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
							<GeneralTab disabled={!canEditGeneral} form={form} />
						</TabsContent>
						<TabsContent value="services">
							<ServicesTab disabled={!canEditServices} form={form} />
						</TabsContent>
						<TabsContent value="records">
							<RecordsTab disabled={!canEditRecords} form={form} />
						</TabsContent>
						<TabsContent value="piecework">
							<PieceworkTab disabled={!canEditPiecework} form={form} />
						</TabsContent>
					</div>
				</Tabs>
			</Form>
		</div>
	);
}

// --- Tab Components ---

function GeneralTab({
	form,
	disabled,
}: {
	form: UseFormReturn<FormValues>;
	disabled?: boolean;
}) {
	const c = form.control;
	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Identity</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-4">
					<FieldInput
						control={c}
						description="Initials of the person sending questionnaires. Will be filled in on questionnaire sites."
						disabled={disabled}
						label="Initials"
						name="config.initials"
					/>
					<FieldInput
						control={c}
						description="First name of the person sending questionnaires. Will be inserted into reminder messages. Must be the name of a Quo user."
						disabled={disabled}
						label="Name"
						name="config.name"
					/>
					<FieldInput
						control={c}
						description="Email entered into WPS for the DP-4."
						disabled={disabled}
						label="DP-4 Email"
						name="config.email"
					/>
					<FieldInput
						control={c}
						description="The email address used as the alias that sends Receive Run emails."
						disabled={disabled}
						label="Receive From Email"
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
						description="The Google Sheet ID for the Punch List."
						disabled={disabled}
						label="Punch List ID"
						name="config.punch_list_id"
					/>
					<FieldInput
						control={c}
						description="The cell range to read from the Punch List."
						disabled={disabled}
						label="Punch List Range"
						name="config.punch_list_range"
					/>
					<ProtectedFieldInput
						control={c}
						description="The Google Sheet ID for logging failed operations."
						disabled={disabled}
						label="Failed Sheet ID"
						name="config.failed_sheet_id"
					/>
					<FieldInput
						control={c}
						description="The Google Drive folder ID for payroll documents."
						disabled={disabled}
						label="Payroll Folder ID"
						name="config.payroll_folder_id"
					/>
					<ProtectedFieldInput
						className="col-span-2"
						control={c}
						description="The connection string for the database."
						disabled={disabled}
						label="DB URL"
						name="config.database_url"
					/>
				</CardContent>
			</Card>
			<div className="grid grid-cols-2 gap-6">
				<ListEditor
					control={c}
					description="List of emails that receive Receive Run emails."
					disabled={disabled}
					label="QReceive Emails"
					name="config.qreceive_emails"
					newItem={{ value: "" }}
					renderItem={(i) => (
						<FieldInput
							className="w-full"
							control={c}
							disabled={disabled}
							name={`config.qreceive_emails.${i}.value` as Path<FormValues>}
						/>
					)}
				/>
				<ListEditor
					control={c}
					description="List of TherapyAppointment users to exclude when downloading information."
					disabled={disabled}
					label="Excluded TA"
					name="config.excluded_ta"
					newItem={{ value: "" }}
					renderItem={(i) => (
						<FieldInput
							className="w-full"
							control={c}
							disabled={disabled}
							name={`config.excluded_ta.${i}.value` as Path<FormValues>}
						/>
					)}
				/>
			</div>
		</div>
	);
}

function ServicesTab({
	form,
	disabled,
}: {
	form: UseFormReturn<FormValues>;
	disabled?: boolean;
}) {
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
						description="Username for TherapyAppointment (This user will be used to send questionnaires)."
						disabled={disabled}
						label="User"
						name="services.therapyappointment.username"
					/>
					<FieldInput
						control={c}
						disabled={disabled}
						label="Password"
						name="services.therapyappointment.password"
						type="password"
					/>
					<FieldInput
						control={c}
						disabled={disabled}
						label="Admin User"
						name="services.therapyappointment.admin_username"
					/>
					<FieldInput
						control={c}
						disabled={disabled}
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
								disabled={disabled}
								label="User"
								name={`services.${svc}.username`}
							/>
							<FieldInput
								control={c}
								disabled={disabled}
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
					<CardTitle>Quo</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<ProtectedFieldInput
							control={c}
							description="API Key for Quo integration."
							disabled={disabled}
							label="API Key"
							name="services.openphone.key"
						/>
						<ProtectedFieldInput
							control={c}
							disabled={disabled}
							label="Main #"
							name="services.openphone.main_number"
						/>
					</div>
					<Separator />
					<KeyValueList
						control={c}
						defaultValue={{ id: "", phone: "" }}
						description="Map of Quo user IDs to phone numbers."
						disabled={disabled}
						keyLabel="Name"
						label="Users"
						name="services.openphone.users"
						renderValue={(p, d) => (
							<div className="grid flex-1 grid-cols-2 gap-2">
								<FieldInput
									control={c}
									disabled={d}
									name={`${p}.id` as Path<FormValues>}
									placeholder="ID"
								/>
								<FieldInput
									control={c}
									disabled={d}
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

function RecordsTab({
	form,
	disabled,
}: {
	form: UseFormReturn<FormValues>;
	disabled?: boolean;
}) {
	return (
		<div className="grid gap-6">
			<Card>
				<CardContent className="grid grid-cols-2 gap-4 pt-6">
					<ProtectedFieldInput
						control={form.control}
						description="The Google Drive folder ID for storing client records consent forms."
						disabled={disabled}
						label="Records Folder ID"
						name="config.records_folder_id"
					/>
					<ProtectedFieldInput
						control={form.control}
						description="The Google Drive folder ID where sent records consent forms are archived."
						disabled={disabled}
						label="Sent Folder ID"
						name="config.sent_records_folder_id"
					/>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Emails Map</CardTitle>
					<CardDescription>
						Map of school districts to emails to send records requests to.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue={{ email: "", fax: false }}
						disabled={disabled}
						keyLabel="Identifier"
						label=""
						name="config.records_emails"
						renderValue={(p, d) => (
							<div className="flex flex-1 items-center gap-2">
								<FieldInput
									className="flex-1"
									control={form.control}
									disabled={d}
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
													disabled={d}
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

function PieceworkTab({
	form,
	disabled,
}: {
	form: UseFormReturn<FormValues>;
	disabled?: boolean;
}) {
	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Costs</CardTitle>
					<CardDescription>Per evaluator rates.</CardDescription>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue={{}}
						disabled={disabled}
						keyLabel="Evaluator"
						label=""
						name="config.piecework.costs"
						renderValue={(p, d) => (
							<div className="grid flex-1 grid-cols-4 gap-2">
								{["DA", "EVAL", "DAEVAL", "REPORT"].map((k) => (
									<FormField
										control={form.control}
										key={k}
										name={`${p}.${k}` as Path<FormValues>}
										render={({ field }) => (
											<FormItem>
												<FormLabel className="text-[10px] text-muted-foreground">
													{k}
												</FormLabel>
												<FormControl>
													<Input
														disabled={d}
														step="1"
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
					<CardDescription>
						Initial to name map for report writers.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue=""
						disabled={disabled}
						keyClassName="w-32"
						keyLabel="Initials"
						label=""
						name="config.piecework.name_map"
						renderValue={(p, d) => (
							<FieldInput
								className="flex-1"
								control={form.control}
								disabled={d}
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
