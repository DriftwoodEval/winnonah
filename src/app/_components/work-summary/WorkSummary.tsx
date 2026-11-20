"use client";

import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { DatePicker } from "@ui/date-picker";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { format, subDays, subMonths } from "date-fns";
import {
	ClipboardCheckIcon,
	ClipboardListIcon,
	TimerIcon,
	UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { cn, evaluatorDisplayName } from "~/lib/utils";
import { api } from "~/trpc/react";

const DA_EVAL_ORDER = ["DA", "EVAL", "DAEVAL"] as const;
const ASD_ADHD_ORDER = ["ASD", "ADHD", "ASD+LD", "ADHD+LD", "LD"];

type Preset = "4w" | "3m" | "6m" | "custom";
type ViewMode = "total" | "average" | "median";

function toUTCMidnight(d: Date): Date {
	return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function getPresetDates(preset: Exclude<Preset, "custom">): {
	startDate: Date;
	endDate: Date;
} {
	const today = toUTCMidnight(new Date());
	const map = {
		"4w": subDays(today, 28),
		"3m": subMonths(today, 3),
		"6m": subMonths(today, 6),
	};
	return { startDate: map[preset], endDate: today };
}

const AGE_GROUP_ORDER = ["young", "older"] as const;

type ColDef = {
	key: string;
	daEval: string;
	asdAdhd: string | null;
	ageGroup: string | null;
};
type ColGroup = { daEval: string; cols: ColDef[]; simple: boolean };

function parseColKey(key: string): ColDef {
	const parts = key.split("/");
	const lastPart = parts.at(-1);
	const ageGroup =
		lastPart === "young" || lastPart === "older" ? lastPart : null;
	const coreParts = ageGroup ? parts.slice(0, -1) : parts;
	const daEval = coreParts[0] ?? key;
	const asdAdhd = coreParts.length > 1 ? coreParts.slice(1).join("/") : null;
	return { key, daEval, asdAdhd, ageGroup };
}

function buildColGroups(
	appointments: { weeklyData: Record<string, number[]> }[],
): ColGroup[] {
	const seen = new Set<string>();
	for (const row of appointments) {
		for (const key of Object.keys(row.weeklyData)) seen.add(key);
	}
	const cols: ColDef[] = [...seen].map(parseColKey);
	cols.sort((a, b) => {
		const da =
			DA_EVAL_ORDER.indexOf(a.daEval as (typeof DA_EVAL_ORDER)[number]) -
			DA_EVAL_ORDER.indexOf(b.daEval as (typeof DA_EVAL_ORDER)[number]);
		if (da !== 0) return da;
		const ai = a.asdAdhd ? ASD_ADHD_ORDER.indexOf(a.asdAdhd) : -1;
		const bi = b.asdAdhd ? ASD_ADHD_ORDER.indexOf(b.asdAdhd) : -1;
		if (ai !== bi) return ai - bi;
		const ag = a.ageGroup
			? AGE_GROUP_ORDER.indexOf(a.ageGroup as (typeof AGE_GROUP_ORDER)[number])
			: -1;
		const bg = b.ageGroup
			? AGE_GROUP_ORDER.indexOf(b.ageGroup as (typeof AGE_GROUP_ORDER)[number])
			: -1;
		return ag - bg;
	});
	const groups: ColGroup[] = [];
	for (const col of cols) {
		const last = groups.at(-1);
		if (last?.daEval === col.daEval) last.cols.push(col);
		else groups.push({ daEval: col.daEval, cols: [col], simple: false });
	}
	for (const g of groups) {
		g.simple =
			g.cols.length === 1 && !g.cols[0]?.asdAdhd && !g.cols[0]?.ageGroup;
	}
	return groups;
}

function computeValue(
	weeklyCounts: number[] | undefined,
	mode: ViewMode,
	numWeeks: number,
): number {
	if (!weeklyCounts || weeklyCounts.length === 0) return 0;
	const total = weeklyCounts.reduce((a, b) => a + b, 0);
	if (mode === "total") return total;
	if (mode === "average") return total / numWeeks;
	// Pad with zeros for weeks with no activity, then take median
	const fullCount = Math.max(weeklyCounts.length, Math.ceil(numWeeks));
	const padded = [
		...weeklyCounts,
		...Array<number>(fullCount - weeklyCounts.length).fill(0),
	].sort((a, b) => a - b);
	const mid = Math.floor(padded.length / 2);
	return padded.length % 2 === 0
		? ((padded[mid - 1] ?? 0) + (padded[mid] ?? 0)) / 2
		: (padded[mid] ?? 0);
}

function fmt(val: number): string {
	return val % 1 === 0 ? val.toString() : val.toFixed(1);
}

function fmtCell(val: number | undefined): string {
	if (val === undefined) return "-";
	return fmt(val);
}

function calcEstimatedMinutes(
	keyValues: Record<string, number>,
	durations: Record<string, number>,
	globalDefaults: Record<string, number>,
): number {
	const hasDurations =
		Object.keys(durations).length > 0 || Object.keys(globalDefaults).length > 0;
	if (!hasDurations) return 0;
	let minutes = 0;
	for (const [key, apptCount] of Object.entries(keyValues)) {
		const { daEval, asdAdhd, ageGroup } = parseColKey(key);
		const baseKey = asdAdhd ? `${daEval}/${asdAdhd}` : daEval;
		const ageSuffix = ageGroup ? `/${ageGroup}` : "";
		// Fallback chain: exact age+diag -> age+type -> any-age+diag -> any-age+type -> age-default -> global-default
		const lookup = (d: Record<string, number>): number | undefined =>
			(ageSuffix ? d[`${baseKey}${ageSuffix}`] : undefined) ??
			(ageSuffix ? d[`${daEval}${ageSuffix}`] : undefined) ??
			d[baseKey] ??
			d[daEval] ??
			(ageSuffix ? d[`default${ageSuffix}`] : undefined) ??
			d.default;
		const duration = lookup(durations) ?? lookup(globalDefaults);
		if (duration !== undefined) minutes += apptCount * duration;
	}
	return minutes;
}

function fmtHours(minutes: number): string {
	if (minutes === 0) return "-";
	const h = minutes / 60;
	return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

// Reads "5 min late" or "3 min early"; zero reads as the `zero` label.
function fmtMinuteWords(
	minutes: number,
	positive: string,
	negative: string,
	zero: string,
): string {
	const rounded = Math.round(minutes);
	if (rounded === 0) return zero;
	return `${Math.abs(rounded)} min ${rounded > 0 ? positive : negative}`;
}

const HEADER_ROW = "bg-muted hover:bg-muted";
const STICKY_FIRST = "sticky left-0 z-10";

function CardHeading({
	icon,
	title,
	hint,
}: {
	icon: React.ReactNode;
	title: string;
	hint: string;
}) {
	return (
		<CardHeader className="flex flex-row items-center gap-3 space-y-0">
			<div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
			<div>
				<CardTitle>{title}</CardTitle>
				<p className="text-sm text-muted-foreground">{hint}</p>
			</div>
		</CardHeader>
	);
}

// The Database page's Appointments tab for the date range, with one filter
// applied (a filter key and its value).
function appointmentsHref(
	filter: { key: string; value: string },
	startDate?: Date,
	endDate?: Date,
): string {
	const params = new URLSearchParams({ table: "appointments" });
	if (startDate && endDate) {
		params.set("from", format(startDate, "yyyy-MM-dd"));
		params.set("to", format(endDate, "yyyy-MM-dd"));
	}
	params.set(filter.key, filter.value);
	return `/database?${params}`;
}

// A count that opens the Database page's Appointments tab with the matching
// rows: the date range plus the filter that produced the count.
function CheckinCountLink({
	count,
	filter,
	name,
	startDate,
	endDate,
}: {
	count: number;
	filter: "arrived" | "started" | "left" | "logged";
	name: string;
	startDate?: Date;
	endDate?: Date;
}) {
	if (!count) return <>{count || "-"}</>;
	const value = filter === "logged" ? `Out of order: ${name}` : name;
	return (
		<Link
			className="underline-offset-2 hover:underline"
			href={appointmentsHref({ key: filter, value }, startDate, endDate)}
		>
			{count}
		</Link>
	);
}

export default function PieceworkSummary() {
	const [preset, setPreset] = useState<Preset>("4w");
	const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
	const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
	const router = useRouter();
	const [viewMode, setViewMode] = useState<ViewMode>("total");

	const effectiveDates =
		preset === "custom"
			? { startDate: customStart, endDate: customEnd }
			: getPresetDates(preset);

	const numWeeks = useMemo(() => {
		if (!effectiveDates.startDate || !effectiveDates.endDate) return 1;
		const ms =
			effectiveDates.endDate.getTime() - effectiveDates.startDate.getTime();
		return Math.max(1, ms / (7 * 24 * 60 * 60 * 1000));
	}, [effectiveDates.startDate, effectiveDates.endDate]);

	const datesReady = !!effectiveDates.startDate && !!effectiveDates.endDate;
	const { data, isLoading, isError, refetch } =
		api.workSummary.getSummary.useQuery(
			{
				startDate: effectiveDates.startDate ?? new Date(),
				endDate: effectiveDates.endDate ?? new Date(),
			},
			{ enabled: datesReady },
		);

	const displayData = useMemo(() => {
		const appts = data?.appointments ?? [];
		const colGroups = buildColGroups(appts);

		function val(weeklyCounts: number[] | undefined): number {
			return computeValue(weeklyCounts, viewMode, numWeeks);
		}

		const rows = appts.map((row) => {
			const keyValues: Record<string, number> = {};
			for (const [key, arr] of Object.entries(row.weeklyData)) {
				keyValues[key] = val(arr);
			}
			const groupValues: Record<string, number> = {};
			for (const g of colGroups) {
				groupValues[g.daEval] = g.cols.reduce(
					(s, c) => s + (keyValues[c.key] ?? 0),
					0,
				);
			}
			const rowTotal = Object.values(keyValues).reduce((a, b) => a + b, 0);
			const globalDefaults = (data?.durationDefaults ?? {}) as Record<
				string,
				number
			>;
			const estMinutes = calcEstimatedMinutes(
				keyValues,
				row.durations as Record<string, number>,
				globalDefaults,
			);
			const loggedMinutes = val(row.loggedWeeklyMinutes);
			return {
				npi: row.npi,
				name: row.name,
				keyValues,
				groupValues,
				rowTotal,
				estMinutes,
				loggedMinutes,
			};
		});

		const footerKeys: Record<string, number> = {};
		for (const r of rows) {
			for (const [k, v] of Object.entries(r.keyValues)) {
				footerKeys[k] = (footerKeys[k] ?? 0) + v;
			}
		}
		const footerGroups: Record<string, number> = {};
		for (const g of colGroups) {
			footerGroups[g.daEval] = g.cols.reduce(
				(s, c) => s + (footerKeys[c.key] ?? 0),
				0,
			);
		}
		const footerTotal = Object.values(footerKeys).reduce((a, b) => a + b, 0);
		const footerEstMinutes = rows.reduce((s, r) => s + r.estMinutes, 0);
		const footerLoggedMinutes = rows.reduce((s, r) => s + r.loggedMinutes, 0);
		const showProjectedHours = rows.some((r) => r.estMinutes > 0);
		const showLoggedHours = rows.some((r) => r.loggedMinutes > 0);

		return {
			colGroups,
			rows,
			footerKeys,
			footerGroups,
			footerTotal,
			footerEstMinutes,
			footerLoggedMinutes,
			showProjectedHours,
			showLoggedHours,
		};
	}, [data, viewMode, numWeeks]);

	const openEvaluator = (npi: number) =>
		router.push(
			appointmentsHref(
				{ key: "evaluators", value: String(npi) },
				effectiveDates.startDate,
				effectiveDates.endDate,
			),
		);
	const linkDates = {
		startDate: effectiveDates.startDate,
		endDate: effectiveDates.endDate,
	};
	const showOutOfOrder =
		data?.checkins.some((row) => row.outOfOrder > 0) ?? false;

	const timingRows = useMemo(() => {
		const rows = new Map<
			number,
			{
				npi: number;
				name: string;
				timing?: NonNullable<typeof data>["timing"][number];
				arrival?: NonNullable<typeof data>["dayLateness"][number];
			}
		>();
		for (const t of data?.timing ?? []) {
			rows.set(t.npi, { npi: t.npi, name: t.name, timing: t });
		}
		for (const a of data?.dayLateness ?? []) {
			const row = rows.get(a.npi) ?? { npi: a.npi, name: a.name };
			rows.set(a.npi, { ...row, arrival: a });
		}
		return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [data]);

	return (
		<div className="flex w-full flex-col gap-6">
			{/* Controls */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
				<ToggleGroup
					onValueChange={(v) => {
						if (v) setPreset(v as Preset);
					}}
					type="single"
					value={preset}
				>
					<ToggleGroupItem value="4w">4 Weeks</ToggleGroupItem>
					<ToggleGroupItem value="3m">3 Months</ToggleGroupItem>
					<ToggleGroupItem value="6m">6 Months</ToggleGroupItem>
					<ToggleGroupItem value="custom">Custom</ToggleGroupItem>
				</ToggleGroup>
				{preset === "custom" && (
					<div className="flex items-end gap-3">
						<DatePicker
							date={customStart}
							id="piecework-start"
							label="From"
							setDate={(d) => setCustomStart(d ? toUTCMidnight(d) : undefined)}
						/>
						<DatePicker
							date={customEnd}
							id="piecework-end"
							label="To"
							setDate={(d) => setCustomEnd(d ? toUTCMidnight(d) : undefined)}
						/>
					</div>
				)}

				<div className="mx-1 hidden h-6 w-px bg-border sm:block" />

				<div className="flex items-center gap-2">
					<span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						Display
					</span>
					<ToggleGroup
						onValueChange={(v) => {
							if (v) setViewMode(v as ViewMode);
						}}
						type="single"
						value={viewMode}
					>
						<ToggleGroupItem value="total">Total</ToggleGroupItem>
						<ToggleGroupItem value="average">
							<span className="sm:hidden">Avg</span>
							<span className="hidden sm:inline">Avg / Wk</span>
						</ToggleGroupItem>
						<ToggleGroupItem value="median">
							<span className="sm:hidden">Median</span>
							<span className="hidden sm:inline">Median / Wk</span>
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>

			{/* Appointments card */}
			<Card>
				<CardHeading
					hint="Click an evaluator to open their appointments"
					icon={<UserIcon className="h-5 w-5" />}
					title="Appointments by Evaluator"
				/>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="space-y-2 p-4">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : isError ? (
						<ErrorState compact onRetry={refetch} />
					) : displayData.rows.length > 0 ? (
						<>
							{/* Mobile: evaluator cards */}
							<div className="space-y-2 p-3 md:hidden">
								{displayData.rows.map((row) => (
									<button
										className="w-full cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
										key={row.npi}
										onClick={() => openEvaluator(row.npi)}
										type="button"
									>
										<div className="flex items-center justify-between">
											<span className="font-medium">
												{evaluatorDisplayName(row.name)}
											</span>
											<span className="font-bold">{fmt(row.rowTotal)}</span>
										</div>
										{(displayData.showProjectedHours ||
											displayData.showLoggedHours) && (
											<div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
												{displayData.showProjectedHours && (
													<span>Proj {fmtHours(row.estMinutes)}</span>
												)}
												{displayData.showLoggedHours && (
													<span>Logged {fmtHours(row.loggedMinutes)}</span>
												)}
											</div>
										)}
										<div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
											{displayData.colGroups
												.filter((g) =>
													g.cols.some((c) => c.key in row.keyValues),
												)
												.map((g) => (
													<span key={g.daEval}>
														<span className="font-medium">{g.daEval}</span>{" "}
														{fmt(row.groupValues[g.daEval] ?? 0)}
													</span>
												))}
										</div>
									</button>
								))}
								<div className="rounded-lg border bg-muted/50 p-3">
									<div className="flex items-center justify-between">
										<span className="font-bold">All Evaluators</span>
										<span className="font-bold">
											{fmt(displayData.footerTotal)}
										</span>
									</div>
									{(displayData.showProjectedHours ||
										displayData.showLoggedHours) && (
										<div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
											{displayData.showProjectedHours && (
												<span>
													Proj {fmtHours(displayData.footerEstMinutes)}
												</span>
											)}
											{displayData.showLoggedHours && (
												<span>
													Logged {fmtHours(displayData.footerLoggedMinutes)}
												</span>
											)}
										</div>
									)}
									<div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
										{displayData.colGroups.map((g) => (
											<span key={g.daEval}>
												<span className="font-medium">{g.daEval}</span>{" "}
												{fmt(displayData.footerGroups[g.daEval] ?? 0)}
											</span>
										))}
									</div>
								</div>
							</div>

							{/* Desktop: full table */}
							<div className="hidden overflow-x-auto md:block">
								<Table>
									<TableHeader>
										<TableRow className={HEADER_ROW}>
											<TableHead
												className={cn(
													STICKY_FIRST,
													"bg-muted text-center align-middle",
												)}
												rowSpan={2}
											>
												Evaluator
											</TableHead>
											{displayData.colGroups.map((g) => (
												<TableHead
													className="border-l text-center align-middle"
													colSpan={g.simple ? 1 : g.cols.length + 1}
													key={g.daEval}
													rowSpan={g.simple ? 2 : undefined}
												>
													{g.daEval}
												</TableHead>
											))}
											<TableHead
												className="border-l text-center align-middle"
												rowSpan={2}
											>
												Total
											</TableHead>
											{displayData.showProjectedHours && (
												<TableHead
													className="border-l text-center align-middle"
													rowSpan={2}
												>
													Projected Hours
												</TableHead>
											)}
											{displayData.showLoggedHours && (
												<TableHead
													className="border-l text-center align-middle"
													rowSpan={2}
												>
													Logged Hours
												</TableHead>
											)}
										</TableRow>
										<TableRow className={HEADER_ROW}>
											{displayData.colGroups.map((g) => (
												<Fragment key={g.daEval}>
													{g.simple ? null : (
														<>
															{g.cols.map((col, i) => {
																const ageLabel =
																	col.ageGroup === "young"
																		? " ≤6"
																		: col.ageGroup === "older"
																			? " 7+"
																			: "";
																return (
																	<TableHead
																		className={cn(
																			"text-center",
																			i === 0 && "border-l",
																		)}
																		key={col.key}
																	>
																		{(col.asdAdhd ?? "-") + ageLabel}
																	</TableHead>
																);
															})}
															<TableHead className="text-center font-semibold">
																Total
															</TableHead>
														</>
													)}
												</Fragment>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{displayData.rows.map((row) => (
											<TableRow
												className="cursor-pointer hover:bg-muted/50"
												key={row.npi}
												onClick={() => openEvaluator(row.npi)}
											>
												<TableCell
													className={cn(
														STICKY_FIRST,
														"bg-card text-center font-medium",
													)}
												>
													{evaluatorDisplayName(row.name)}
												</TableCell>
												{displayData.colGroups.map((g) => (
													<Fragment key={g.daEval}>
														{g.simple ? (
															<TableCell className="border-l text-center">
																{fmtCell(row.keyValues[g.cols[0]?.key ?? ""])}
															</TableCell>
														) : (
															<>
																{g.cols.map((col, i) => (
																	<TableCell
																		className={cn(
																			"text-center",
																			i === 0 && "border-l",
																		)}
																		key={col.key}
																	>
																		{fmtCell(row.keyValues[col.key])}
																	</TableCell>
																))}
																<TableCell className="text-center font-semibold">
																	{fmt(row.groupValues[g.daEval] ?? 0)}
																</TableCell>
															</>
														)}
													</Fragment>
												))}
												<TableCell className="border-l text-center font-bold">
													{fmt(row.rowTotal)}
												</TableCell>
												{displayData.showProjectedHours && (
													<TableCell className="border-l text-center text-muted-foreground">
														{fmtHours(row.estMinutes)}
													</TableCell>
												)}
												{displayData.showLoggedHours && (
													<TableCell className="border-l text-center text-muted-foreground">
														{fmtHours(row.loggedMinutes)}
													</TableCell>
												)}
											</TableRow>
										))}
									</TableBody>
									<TableFooter>
										<TableRow className={HEADER_ROW}>
											<TableCell
												className={cn(
													STICKY_FIRST,
													"bg-muted text-center font-bold",
												)}
											>
												All Evaluators
											</TableCell>
											{displayData.colGroups.map((g) => (
												<Fragment key={g.daEval}>
													{g.simple ? (
														<TableCell className="border-l text-center font-bold">
															{fmt(
																displayData.footerKeys[g.cols[0]?.key ?? ""] ??
																	0,
															)}
														</TableCell>
													) : (
														<>
															{g.cols.map((col, i) => (
																<TableCell
																	className={cn(
																		"text-center",
																		i === 0 && "border-l",
																	)}
																	key={col.key}
																>
																	{fmt(displayData.footerKeys[col.key] ?? 0)}
																</TableCell>
															))}
															<TableCell className="text-center font-bold">
																{fmt(displayData.footerGroups[g.daEval] ?? 0)}
															</TableCell>
														</>
													)}
												</Fragment>
											))}
											<TableCell className="border-l text-center font-bold">
												{fmt(displayData.footerTotal)}
											</TableCell>
											{displayData.showProjectedHours && (
												<TableCell className="border-l text-center font-bold">
													{fmtHours(displayData.footerEstMinutes)}
												</TableCell>
											)}
											{displayData.showLoggedHours && (
												<TableCell className="border-l text-center font-bold">
													{fmtHours(displayData.footerLoggedMinutes)}
												</TableCell>
											)}
										</TableRow>
									</TableFooter>
								</Table>
							</div>
						</>
					) : (
						<EmptyState compact title="No appointments in this range" />
					)}
				</CardContent>
			</Card>

			{/* Timing card */}
			<Card>
				<CardHeading
					hint="How long appointments run, when they start, and when evaluators arrive"
					icon={<TimerIcon className="h-5 w-5" />}
					title="Appointment Timing"
				/>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="space-y-2 p-4">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : isError ? (
						<ErrorState compact onRetry={refetch} />
					) : timingRows.length ? (
						<Table>
							<TableHeader>
								<TableRow className={HEADER_ROW}>
									<TableHead
										className={cn(STICKY_FIRST, "bg-muted")}
										rowSpan={2}
									>
										Evaluator
									</TableHead>
									<TableHead className="border-l text-center" colSpan={2}>
										Appointment length vs expected
									</TableHead>
									<TableHead className="border-l text-center" colSpan={2}>
										Late start
									</TableHead>
									<TableHead className="border-l text-center" colSpan={2}>
										Arrival
									</TableHead>
								</TableRow>
								<TableRow className={HEADER_ROW}>
									{["length", "start", "arrival"].map((group) => (
										<Fragment key={group}>
											<TableHead className="border-l text-center">
												Avg
											</TableHead>
											<TableHead className="text-center">Median</TableHead>
										</Fragment>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{timingRows.map((row) => (
									<TableRow className="hover:bg-muted/50" key={row.npi}>
										<TableCell
											className={cn(STICKY_FIRST, "bg-card font-medium")}
										>
											{evaluatorDisplayName(row.name)}
										</TableCell>
										<TableCell className="border-l text-center tabular-nums">
											{row.timing && row.timing.durationSampleSize > 0
												? fmtMinuteWords(
														row.timing.avgDurationDiff,
														"over",
														"under",
														"On expected",
													)
												: "-"}
										</TableCell>
										<TableCell className="text-center tabular-nums">
											{row.timing && row.timing.durationSampleSize > 0
												? fmtMinuteWords(
														row.timing.medianDurationDiff,
														"over",
														"under",
														"On expected",
													)
												: "-"}
										</TableCell>
										<TableCell className="border-l text-center tabular-nums">
											{row.timing && row.timing.lateStartSampleSize > 0
												? fmtMinuteWords(
														row.timing.avgLateStart,
														"late",
														"early",
														"On time",
													)
												: "-"}
										</TableCell>
										<TableCell className="text-center tabular-nums">
											{row.timing && row.timing.lateStartSampleSize > 0
												? fmtMinuteWords(
														row.timing.medianLateStart,
														"late",
														"early",
														"On time",
													)
												: "-"}
										</TableCell>
										<TableCell className="border-l text-center tabular-nums">
											{row.arrival
												? fmtMinuteWords(
														row.arrival.avgLateness,
														"late",
														"early",
														"On time",
													)
												: "-"}
										</TableCell>
										<TableCell className="text-center tabular-nums">
											{row.arrival
												? fmtMinuteWords(
														row.arrival.medianLateness,
														"late",
														"early",
														"On time",
													)
												: "-"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<EmptyState compact title="No check-in timing data in this range" />
					)}
				</CardContent>
			</Card>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Reports card */}
				<Card>
					<CardHeading
						hint="Who wrote each report"
						icon={<ClipboardListIcon className="h-5 w-5" />}
						title="Reports Written"
					/>
					<CardContent className="p-0">
						{isLoading ? (
							<div className="space-y-2 p-4">
								<Skeleton className="h-8 w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
						) : isError ? (
							<ErrorState compact onRetry={refetch} />
						) : data?.reports.length ? (
							<Table>
								<TableHeader>
									<TableRow className={HEADER_ROW}>
										<TableHead className={cn(STICKY_FIRST, "bg-muted")}>
											Writer
										</TableHead>
										<TableHead className="border-l text-center">
											Reports
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.reports.map((row) => (
										<TableRow className="hover:bg-muted/50" key={row.name}>
											<TableCell
												className={cn(STICKY_FIRST, "bg-card font-medium")}
											>
												{row.name}
											</TableCell>
											<TableCell className="border-l text-center tabular-nums">
												{row.count}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						) : (
							<EmptyState compact title="No reports tracked in this range" />
						)}
					</CardContent>
				</Card>

				{/* Check-ins card */}
				<Card>
					<CardHeading
						hint="Who checked in clients, and who checked in evaluators for the day. Click a client count to see those appointments"
						icon={<ClipboardCheckIcon className="h-5 w-5" />}
						title="Appointment Check-ins"
					/>
					<CardContent className="p-0">
						{isLoading ? (
							<div className="space-y-2 p-4">
								<Skeleton className="h-8 w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
						) : isError ? (
							<ErrorState compact onRetry={refetch} />
						) : data?.checkins.length ? (
							<Table>
								<TableHeader>
									<TableRow className={HEADER_ROW}>
										<TableHead
											className={cn(STICKY_FIRST, "bg-muted")}
											rowSpan={2}
										>
											Checked In By
										</TableHead>
										<TableHead className="border-l text-center" colSpan={3}>
											Client check-ins
										</TableHead>
										<TableHead className="border-l text-center" colSpan={2}>
											Evaluator check-ins
										</TableHead>
										{showOutOfOrder && (
											<TableHead className="border-l text-center" rowSpan={2}>
												Out of order
											</TableHead>
										)}
									</TableRow>
									<TableRow className={HEADER_ROW}>
										<TableHead className="border-l text-center">
											Arrived
										</TableHead>
										<TableHead className="text-center">Started</TableHead>
										<TableHead className="text-center">Left</TableHead>
										<TableHead className="border-l text-center">
											Arrived
										</TableHead>
										<TableHead className="text-center">Left</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{data.checkins.map((row) => (
										<TableRow className="hover:bg-muted/50" key={row.name}>
											<TableCell
												className={cn(STICKY_FIRST, "bg-card font-medium")}
											>
												{row.name}
											</TableCell>
											<TableCell className="border-l text-center tabular-nums">
												<CheckinCountLink
													count={row.clientArrived}
													{...linkDates}
													filter="arrived"
													name={row.name}
												/>
											</TableCell>
											<TableCell className="text-center tabular-nums">
												<CheckinCountLink
													count={row.clientStarted}
													{...linkDates}
													filter="started"
													name={row.name}
												/>
											</TableCell>
											<TableCell className="text-center tabular-nums">
												<CheckinCountLink
													count={row.clientLeft}
													{...linkDates}
													filter="left"
													name={row.name}
												/>
											</TableCell>
											<TableCell className="border-l text-center tabular-nums">
												{row.evaluatorArrived}
											</TableCell>
											<TableCell className="text-center tabular-nums">
												{row.evaluatorLeft}
											</TableCell>
											{showOutOfOrder && (
												<TableCell className="border-l text-center tabular-nums">
													<CheckinCountLink
														count={row.outOfOrder}
														{...linkDates}
														filter="logged"
														name={row.name}
													/>
												</TableCell>
											)}
										</TableRow>
									))}
								</TableBody>
							</Table>
						) : (
							<EmptyState compact title="No check-ins tracked in this range" />
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
