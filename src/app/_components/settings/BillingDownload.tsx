"use client";

import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { format } from "date-fns";
import { DownloadIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

type CsvKey =
	| "billing"
	| "appointments"
	| "demographic"
	| "insurance"
	| "chart"
	| "referral";

type ScriptKey =
	| "appointment_reminders"
	| "qsend"
	| "records_request"
	| "piecework"
	| "qreceive";

const SCRIPT_ENTRIES: { key: ScriptKey; label: string }[] = [
	{ key: "appointment_reminders", label: "Appointment Reminders" },
	{ key: "qsend", label: "Questionnaire Send" },
	{ key: "records_request", label: "Records Request" },
	{ key: "piecework", label: "Piecework" },
	{ key: "qreceive", label: "Questionnaire Receive" },
];

const CSV_FILES: { key: CsvKey; label: string; filename: string }[] = [
	{ key: "billing", label: "Billing", filename: "clients-billing.csv" },
	{
		key: "appointments",
		label: "Appointments",
		filename: "clients-appointments.csv",
	},
	{
		key: "demographic",
		label: "Demographic",
		filename: "clients-demographic.csv",
	},
	{ key: "insurance", label: "Insurance", filename: "clients-insurance.csv" },
	{ key: "chart", label: "Chart", filename: "clients-chart.csv" },
	{
		key: "referral",
		label: "Referral Report",
		filename: "client-referral-report.csv",
	},
];

export default function BillingDownload() {
	const [pendingKey, setPendingKey] = useState<CsvKey | null>(null);
	const downloadMutation = api.clients.downloadCsv.useMutation();
	const { data: fileInfo, isLoading: fileInfoLoading } =
		api.clients.getCsvFileInfo.useQuery();
	const { data: scriptInfo, isLoading: scriptInfoLoading } =
		api.clients.getScriptRunInfo.useQuery();

	const handleDownload = async (key: CsvKey, filename: string) => {
		setPendingKey(key);
		try {
			const csvData = await downloadMutation.mutateAsync(key);
			const blob = new Blob([csvData], { type: "text/csv" });
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
			toast.success(`${filename} downloaded successfully`);
		} catch (error) {
			toast.error("Failed to download CSV", {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setPendingKey(null);
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardContent>
					<div className="flex flex-wrap gap-3">
						{CSV_FILES.map(({ key, label, filename }) => {
							const mtime = fileInfo?.[key];
							return (
								<div className="flex flex-col gap-1" key={key}>
									<Button
										disabled={pendingKey !== null}
										onClick={() => handleDownload(key, filename)}
									>
										{pendingKey === key ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<DownloadIcon className="mr-2 h-4 w-4" />
										)}
										Download {label} CSV
									</Button>
									<span className="text-center text-muted-foreground text-xs">
										{fileInfoLoading
											? null
											: mtime
												? format(new Date(mtime * 1000), "MM/dd/yy h:mm a")
												: "Missing"}
									</span>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<h3 className="mb-3 font-semibold text-sm">Last Script Run Times</h3>
					<div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
						{SCRIPT_ENTRIES.map(({ key, label }) => {
							const mtime = scriptInfo?.[key];
							return (
								<div className="flex flex-col" key={key}>
									<span className="font-medium">{label}</span>
									<span className="text-muted-foreground text-xs">
										{scriptInfoLoading
											? null
											: mtime
												? format(new Date(mtime * 1000), "MM/dd/yy h:mm a")
												: "Missing"}
									</span>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
