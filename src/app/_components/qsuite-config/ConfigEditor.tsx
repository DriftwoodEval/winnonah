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
import { Label } from "@ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Info, Loader2, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { useCheckPermission } from "~/hooks/use-check-permission";
import { cn } from "~/lib/utils";
import {
	pythonConfigSchema,
	serviceSchema,
	serviceWithAdminSchema,
} from "~/lib/validations";
import { api } from "~/trpc/react";

const stripSuffix = (name: string) =>
	name.replace(/ (County )?School District/, "");

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
			keyVal(
				z.object({
					email: z.email(),
					fax: z.boolean(),
					aliases: z.string().optional(),
				}),
			),
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
			staff: z.array(
				keyVal(
					z.object({
						name: z.string().min(1),
						email: z.email().or(z.literal("")),
					}),
				),
			),
		}),
	}),
	services: z.object({
		openphone: z.object({
			key: z.string(),
			main_number: z.string(),
			users: z.array(keyVal(z.object({ id: z.string() }))),
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
	Object.entries(rec)
		.map(([key, value]) => ({ key, value }))
		.sort((a, b) => a.key.localeCompare(b.key));
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
	list,
}: {
	control: Control<T>;
	name: Path<T>;
	label?: string;
	type?: string;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	description?: string;
	list?: string;
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
							list={list}
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
	renderKey,
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
	renderKey?: (prefix: string, disabled?: boolean) => React.ReactNode;
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
						{renderKey ? (
							renderKey(`${name}.${i}.key`, disabled)
						) : (
							<FieldInput
								control={control}
								disabled={disabled}
								name={`${name}.${i}.key` as Path<T>}
								placeholder={keyLabel}
							/>
						)}
					</div>
					{renderValue(`${name}.${i}.value`, disabled)}
				</>
			)}
		/>
	);
}

// --- Main Page Component ---

export function ConfigEditor() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const activeTab = searchParams.get("tab") ?? "general";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	const utils = api.useUtils();
	const { data: config, isLoading } = api.pyConfig.get.useQuery();
	const mutation = api.pyConfig.update.useMutation({
		onSuccess: () => {
			toast.success("Saved");
			utils.pyConfig.invalidate();
		},
		onError: (e) => toast.error(e.message),
	});

	const can = useCheckPermission();
	const canEditGeneral = can("settings:qsuite:general");
	const canEditServices = can("settings:qsuite:services");
	const canEditRecords = can("settings:qsuite:records");
	const canEditPiecework = can("settings:qsuite:piecework");
	const canEditAny =
		canEditGeneral || canEditServices || canEditRecords || canEditPiecework;

	const tabPermissions: Record<string, boolean> = useMemo(
		() => ({
			general: canEditGeneral,
			services: canEditServices,
			records: canEditRecords,
			piecework: canEditPiecework,
		}),
		[canEditGeneral, canEditServices, canEditRecords, canEditPiecework],
	);

	const canAccessActiveTab = tabPermissions[activeTab];

	useEffect(() => {
		if (!canAccessActiveTab) {
			const firstAllowedTab = Object.entries(tabPermissions).find(
				([_, hasPerm]) => hasPerm,
			)?.[0];

			if (firstAllowedTab) {
				const params = new URLSearchParams(searchParams.toString());
				params.set("tab", firstAllowedTab);
				router.replace(`${pathname}?${params.toString()}`);
			}
		}
	}, [canAccessActiveTab, tabPermissions, pathname, router, searchParams]);

	const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

	const apiKey = form.watch("services.openphone.key");
	const opUsersMutation = api.quo.getQuoUsers.useMutation({
		onSuccess: (data) => {
			form.setValue(
				"services.openphone.users",
				data
					.map((u) => ({
						key: u.name,
						value: { id: u.id },
					}))
					.sort((a, b) => a.key.localeCompare(b.key)),
			);
			toast.success(`Synced ${data.length} users`);
		},
		onError: (e) => toast.error(e.message),
	});

	useEffect(() => {
		if (!config) return;
		const { config: c, services: s } = config;

		form.reset({
			config: {
				...c,
				qreceive_emails: c.qreceive_emails.map((value) => ({ value })),
				excluded_ta: c.excluded_ta.map((value) => ({ value })),
				records_emails: toEntries(c.records_emails).map((e) => ({
					key: stripSuffix(e.key),
					value: {
						email: e.value.email,
						fax: e.value.fax,
						aliases: e.value.aliases?.join(", ") ?? "",
					},
				})),
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
					staff: toEntries(c.piecework.name_map).map((e) => ({
						key: e.key,
						value: {
							name: e.value,
							email: c.piecework.payroll_emails[e.value] ?? "",
						},
					})),
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
						records_emails: fromEntries(
							data.config.records_emails.map((e) => ({
								key: e.key,
								value: {
									email: e.value.email,
									fax: e.value.fax,
									aliases: e.value.aliases
										? e.value.aliases
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean)
										: [],
								},
							})),
						),
						piecework: {
							costs: fromEntries(data.config.piecework.costs),
							name_map: fromEntries(
								data.config.piecework.staff.map((s) => ({
									key: s.key,
									value: s.value.name,
								})),
							),
							payroll_emails: fromEntries(
								data.config.piecework.staff
									.filter((s) => s.value.email)
									.map((s) => ({
										key: s.value.name,
										value: s.value.email,
									})),
							),
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
					)}
					Save
				</Button>
			</div>
			<Form {...form}>
				<Tabs
					className="w-full"
					onValueChange={handleTabChange}
					value={activeTab}
				>
					<TabsList className="grid w-full grid-cols-4">
						{[
							{ label: "General", can: canEditGeneral },
							{ label: "Services", can: canEditServices },
							{ label: "Records", can: canEditRecords },
							{ label: "Piecework", can: canEditPiecework },
						].map((t) => (
							<TabsTrigger
								disabled={!t.can}
								key={t.label}
								value={t.label.toLowerCase()}
							>
								{t.label}
								{!t.can && <Lock className="ml-2 h-3 w-3" />}
							</TabsTrigger>
						))}
					</TabsList>
					<div className="mt-6 space-y-6">
						{!canAccessActiveTab ? (
							<div className="flex h-40 items-center justify-center">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
							</div>
						) : (
							<>
								<TabsContent value="general">
									<GeneralTab disabled={!canEditGeneral} form={form} />
								</TabsContent>
								<TabsContent value="services">
									<ServicesTab
										disabled={!canEditServices}
										form={form}
										onSyncOpenPhone={() => opUsersMutation.mutate({ apiKey })}
										syncingOpenPhone={opUsersMutation.isPending}
									/>
								</TabsContent>
								<TabsContent value="records">
									<RecordsTab disabled={!canEditRecords} form={form} />
								</TabsContent>
								<TabsContent value="piecework">
									<PieceworkTab disabled={!canEditPiecework} form={form} />
								</TabsContent>
							</>
						)}
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
	const opUsers = form.watch("services.openphone.users");

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
					<FormField
						control={c}
						name="config.name"
						render={({ field }) => (
							<FormItem>
								<div className="flex items-center gap-2">
									<FormLabel>Name</FormLabel>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-4 w-4 cursor-help text-muted-foreground" />
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">
												First name of the person sending questionnaires. Will be
												inserted into reminder messages and blamed in Quo. Must
												be the name of a Quo user.
											</p>
										</TooltipContent>
									</Tooltip>
								</div>
								<Select
									disabled={disabled || !opUsers || opUsers.length === 0}
									onValueChange={field.onChange}
									value={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select a user" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{Array.from(
											new Set(
												opUsers
													?.map((u) => u.key.split(" ")[0])
													.filter((n): n is string => !!n) ?? [],
											),
										)
											.sort()
											.map((name) => (
												<SelectItem key={name} value={name}>
													{name}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
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
					<ProtectedFieldInput
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
	onSyncOpenPhone,
	syncingOpenPhone,
}: {
	form: UseFormReturn<FormValues>;
	disabled?: boolean;
	onSyncOpenPhone: () => void;
	syncingOpenPhone: boolean;
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
						label="Admin User"
						name="services.therapyappointment.admin_username"
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
						label="Admin Password"
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
								label="Password"
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
					<div className="space-y-4">
						<div className="mb-0 flex items-center justify-between">
							<Label className="font-medium text-sm">Users</Label>
							<Button
								disabled={disabled || syncingOpenPhone}
								onClick={onSyncOpenPhone}
								size="sm"
								type="button"
								variant="outline"
							>
								{syncingOpenPhone ? (
									<Loader2 className="mr-2 h-3 w-3 animate-spin" />
								) : (
									<Plus className="mr-2 h-3 w-3" />
								)}
								Sync from API
							</Button>
						</div>
						<KeyValueList
							control={c}
							defaultValue={{ id: "" }}
							disabled={disabled}
							keyClassName="flex-1"
							keyLabel="Name"
							label=""
							name="services.openphone.users"
							renderValue={(p, d) => (
								<div>
									<FieldInput
										className="flex-1"
										control={c}
										disabled={d}
										name={`${p}.id` as Path<FormValues>}
										placeholder="ID"
									/>
								</div>
							)}
						/>
					</div>
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
	const { data: allSchoolDistricts } =
		api.evaluators.getAllSchoolDistricts.useQuery();
	const recordsEmails = form.watch("config.records_emails");
	const selectedDistricts = Array.isArray(recordsEmails)
		? recordsEmails.map((e) => e.key)
		: [];

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
						defaultValue={{ email: "", fax: false, aliases: "" }}
						disabled={disabled}
						keyLabel="District Name"
						label=""
						name="config.records_emails"
						renderKey={(p, d) => (
							<FormField
								control={form.control}
								name={p as Path<FormValues>}
								render={({ field }) => (
									<FormItem>
										<Select
											disabled={d}
											onValueChange={field.onChange}
											value={field.value as string}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select District" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{allSchoolDistricts
													?.filter(
														(dist) =>
															!selectedDistricts.includes(
																stripSuffix(dist.fullName),
															) || stripSuffix(dist.fullName) === field.value,
													)
													.map((dist) => (
														<SelectItem
															key={dist.id}
															value={stripSuffix(dist.fullName)}
														>
															{stripSuffix(dist.fullName)}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
						renderValue={(p, d) => (
							<div className="flex items-center gap-2">
								<FieldInput
									control={form.control}
									disabled={d}
									name={`${p}.email` as Path<FormValues>}
									placeholder="Email"
								/>
								<FieldInput
									control={form.control}
									disabled={d}
									name={`${p}.aliases` as Path<FormValues>}
									placeholder="Aliases (comma separated)"
								/>
								<FormField
									control={form.control}
									name={`${p}.fax` as Path<FormValues>}
									render={({ field }) => (
										<FormItem className="mt-2 flex items-center gap-2 space-y-0">
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
	const { data: evaluators } = api.evaluators.getAll.useQuery();
	const costs = form.watch("config.piecework.costs");
	const selectedCostsEvaluators = Array.isArray(costs)
		? costs.map((c) => c.key)
		: [];

	const staff = form.watch("config.piecework.staff");
	const selectedFullNames = Array.isArray(staff)
		? staff.map((m) => m.value.name)
		: [];

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
						renderKey={(p, d) => (
							<FormField
								control={form.control}
								name={p as Path<FormValues>}
								render={({ field }) => (
									<FormItem>
										<Select
											disabled={d}
											onValueChange={field.onChange}
											value={field.value as string}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select Evaluator" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{(!selectedCostsEvaluators.includes("default") ||
													field.value === "default") && (
													<SelectItem value="default">default</SelectItem>
												)}
												{evaluators
													?.filter(
														(ev) =>
															!selectedCostsEvaluators.includes(
																ev.providerName,
															) || ev.providerName === field.value,
													)
													.map((ev) => (
														<SelectItem key={ev.npi} value={ev.providerName}>
															{ev.providerName}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						)}
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
					<CardTitle>Staff</CardTitle>
					<CardDescription>
						Map initials to full names and payroll emails.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<KeyValueList
						control={form.control}
						defaultValue={{ name: "", email: "" }}
						disabled={disabled}
						keyClassName="w-32"
						keyLabel="Initials"
						label=""
						name="config.piecework.staff"
						renderValue={(p, d) => (
							<div className="grid flex-1 grid-cols-2 gap-2">
								<FieldInput
									control={form.control}
									disabled={d}
									list="evaluator-names-list"
									name={`${p}.name` as Path<FormValues>}
									placeholder="Full Name"
								/>
								<FieldInput
									control={form.control}
									disabled={d}
									name={`${p}.email` as Path<FormValues>}
									placeholder="Email"
								/>
							</div>
						)}
					/>
					<datalist id="evaluator-names-list">
						{evaluators
							?.filter((ev) => !selectedFullNames.includes(ev.providerName))
							.map((ev) => (
								<option key={ev.npi} value={ev.providerName} />
							))}
					</datalist>
				</CardContent>
			</Card>
		</div>
	);
}
