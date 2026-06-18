"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { DatePicker } from "@ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
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
import { ClipboardListIcon, UserIcon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

const DA_EVAL_ORDER = ["DA", "EVAL", "DAEVAL"] as const;
const ASD_ADHD_ORDER = ["ASD", "ADHD", "ASD+ADHD", "ASD+LD", "ADHD+LD", "LD"];

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

type ColDef = { key: string; daEval: string; asdAdhd: string | null };
type ColGroup = { daEval: string; cols: ColDef[] };

function buildColGroups(
	appointments: { weeklyData: Record<string, number[]> }[],
): ColGroup[] {
	const seen = new Set<string>();
	for (const row of appointments) {
		for (const key of Object.keys(row.weeklyData)) seen.add(key);
	}
	const cols: ColDef[] = [...seen].map((key) => {
		const slash = key.indexOf("/");
		if (slash === -1) return { key, daEval: key, asdAdhd: null };
		return { key, daEval: key.slice(0, slash), asdAdhd: key.slice(slash + 1) };
	});
	cols.sort((a, b) => {
		const da =
			DA_EVAL_ORDER.indexOf(a.daEval as (typeof DA_EVAL_ORDER)[number]) -
			DA_EVAL_ORDER.indexOf(b.daEval as (typeof DA_EVAL_ORDER)[number]);
		if (da !== 0) return da;
		const ai = a.asdAdhd ? ASD_ADHD_ORDER.indexOf(a.asdAdhd) : -1;
		const bi = b.asdAdhd ? ASD_ADHD_ORDER.indexOf(b.asdAdhd) : -1;
		return ai - bi;
	});
	const groups: ColGroup[] = [];
	for (const col of cols) {
		const last = groups[groups.length - 1];
		if (last?.daEval === col.daEval) last.cols.push(col);
		else groups.push({ daEval: col.daEval, cols: [col] });
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
	for (const [key, count] of Object.entries(keyValues)) {
		const baseKey = key.split("/")[0] ?? key;
		const duration =
			durations[key] ??
			durations[baseKey] ??
			durations.default ??
			globalDefaults[key] ??
			globalDefaults[baseKey] ??
			globalDefaults.default ??
			0;
		minutes += count * duration;
	}
	return minutes;
}

function fmtHours(minutes: number): string {
	if (minutes === 0) return "-";
	const h = minutes / 60;
	return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

type SelectedEvaluator = { npi: number; name: string };

function AppointmentDetailDialog({
	evaluator,
	startDate,
	endDate,
	onClose,
}: {
	evaluator: SelectedEvaluator;
	startDate: Date;
	endDate: Date;
	onClose: () => void;
}) {
	const { data, isLoading } = api.workSummary.getAppointmentDetail.useQuery({
		evaluatorNpi: evaluator.npi,
		startDate,
		endDate,
	});

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>{evaluator.name}</DialogTitle>
				</DialogHeader>
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				) : data?.length ? (
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead>Date</TableHead>
								<TableHead>Client</TableHead>
								<TableHead>Type</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((appt) => (
								<TableRow className="hover:bg-transparent" key={appt.id}>
									<TableCell className="text-muted-foreground">
										{format(appt.startTime, "MMM d, yyyy h:mm a")}
									</TableCell>
									<TableCell>{appt.clientName}</TableCell>
									<TableCell>
										{appt.asdAdhd
											? `${appt.daEval}/${appt.asdAdhd}`
											: appt.daEval}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<p className="text-muted-foreground text-sm italic">
						No appointments found.
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

export default function PieceworkSummary() {
	const [preset, setPreset] = useState<Preset>("4w");
	const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
	const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
	const [selectedEvaluator, setSelectedEvaluator] =
		useState<SelectedEvaluator | null>(null);
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
	const { data, isLoading } = api.workSummary.getSummary.useQuery(
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
			return {
				npi: row.npi,
				name: row.name,
				keyValues,
				groupValues,
				rowTotal,
				estMinutes,
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
		const showHours = rows.some((r) => r.estMinutes > 0);

		return {
			colGroups,
			rows,
			footerKeys,
			footerGroups,
			footerTotal,
			footerEstMinutes,
			showHours,
		};
	}, [data, viewMode, numWeeks]);

	return (
		<div className="flex w-full flex-col gap-6">
			{/* Controls */}
			<div className="flex flex-wrap items-center gap-3">
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
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
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
				<CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
					<div className="rounded-lg bg-primary/10 p-2 text-primary">
						<UserIcon className="h-5 w-5" />
					</div>
					<CardTitle>Appointments by Evaluator</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="space-y-2 p-4">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : displayData.rows.length > 0 ? (
						<>
							{/* Mobile: evaluator cards */}
							<div className="space-y-2 p-3 md:hidden">
								{displayData.rows.map((row) => (
									<button
										className="w-full cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
										key={row.npi}
										onClick={() =>
											setSelectedEvaluator({ npi: row.npi, name: row.name })
										}
										type="button"
									>
										<div className="flex items-center justify-between">
											<span className="font-medium">{row.name}</span>
											<div className="flex items-baseline gap-2">
												{displayData.showHours && (
													<span className="text-muted-foreground text-sm">
														{fmtHours(row.estMinutes)}
													</span>
												)}
												<span className="font-bold">{fmt(row.rowTotal)}</span>
											</div>
										</div>
										<div className="mt-1 flex flex-wrap gap-3 text-muted-foreground text-sm">
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
										<div className="flex items-baseline gap-2">
											{displayData.showHours && (
												<span className="text-muted-foreground text-sm">
													{fmtHours(displayData.footerEstMinutes)}
												</span>
											)}
											<span className="font-bold">
												{fmt(displayData.footerTotal)}
											</span>
										</div>
									</div>
									<div className="mt-1 flex flex-wrap gap-3 text-muted-foreground text-sm">
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
										<TableRow className="hover:bg-transparent">
											<TableHead
												className="text-center align-middle"
												rowSpan={2}
											>
												Evaluator
											</TableHead>
											{displayData.colGroups.map((g) => (
												<TableHead
													className="border-l text-center"
													colSpan={g.cols.length + 1}
													key={g.daEval}
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
											{displayData.showHours && (
												<TableHead
													className="border-l text-center align-middle"
													rowSpan={2}
												>
													Est. Hours
												</TableHead>
											)}
										</TableRow>
										<TableRow className="hover:bg-transparent">
											{displayData.colGroups.map((g) => (
												<Fragment key={g.daEval}>
													{g.cols.map((col, i) => (
														<TableHead
															className={cn(
																"text-center",
																i === 0 && "border-l",
															)}
															key={col.key}
														>
															{col.asdAdhd ?? "-"}
														</TableHead>
													))}
													<TableHead className="text-center font-semibold">
														Total
													</TableHead>
												</Fragment>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{displayData.rows.map((row) => (
											<TableRow
												className="cursor-pointer hover:bg-muted/50"
												key={row.npi}
												onClick={() =>
													setSelectedEvaluator({
														npi: row.npi,
														name: row.name,
													})
												}
											>
												<TableCell className="text-center font-medium">
													{row.name}
												</TableCell>
												{displayData.colGroups.map((g) => (
													<Fragment key={g.daEval}>
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
													</Fragment>
												))}
												<TableCell className="border-l text-center font-bold">
													{fmt(row.rowTotal)}
												</TableCell>
												{displayData.showHours && (
													<TableCell className="border-l text-center text-muted-foreground">
														{fmtHours(row.estMinutes)}
													</TableCell>
												)}
											</TableRow>
										))}
									</TableBody>
									<TableFooter>
										<TableRow className="hover:bg-transparent">
											<TableCell className="text-center font-bold">
												All Evaluators
											</TableCell>
											{displayData.colGroups.map((g) => (
												<Fragment key={g.daEval}>
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
												</Fragment>
											))}
											<TableCell className="border-l text-center font-bold">
												{fmt(displayData.footerTotal)}
											</TableCell>
											{displayData.showHours && (
												<TableCell className="border-l text-center font-bold">
													{fmtHours(displayData.footerEstMinutes)}
												</TableCell>
											)}
										</TableRow>
									</TableFooter>
								</Table>
							</div>
						</>
					) : (
						<p className="px-4 pb-4 text-muted-foreground text-sm italic">
							No appointments in this range.
						</p>
					)}
				</CardContent>
			</Card>

			{/* Reports card */}
			<Card>
				<CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4">
					<div className="rounded-lg bg-primary/10 p-2 text-primary">
						<ClipboardListIcon className="h-5 w-5" />
					</div>
					<CardTitle>Reports Written</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{isLoading ? (
						<div className="space-y-2 p-4">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					) : data?.reports.length ? (
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Writer</TableHead>
									<TableHead className="text-center">Reports</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.reports.map((row) => (
									<TableRow className="hover:bg-transparent" key={row.name}>
										<TableCell className="font-medium">{row.name}</TableCell>
										<TableCell className="text-center">{row.count}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<p className="px-4 pb-4 text-muted-foreground text-sm italic">
							No reports tracked in this range.
						</p>
					)}
				</CardContent>
			</Card>

			{selectedEvaluator &&
				effectiveDates.startDate &&
				effectiveDates.endDate && (
					<AppointmentDetailDialog
						endDate={effectiveDates.endDate}
						evaluator={selectedEvaluator}
						onClose={() => setSelectedEvaluator(null)}
						startDate={effectiveDates.startDate}
					/>
				)}
		</div>
	);
}
