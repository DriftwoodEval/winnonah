"use client";

import { Tabs, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalRecordsDataView } from "./ExternalRecordsDataView";
import { QuestionnaireDataView } from "./QuestionnaireDataView";

const TABLES = [
	{
		id: "questionnaires",
		label: "Questionnaires",
		description:
			"Every questionnaire sent to a client. Archived questionnaires are hidden unless you filter for them.",
	},
	{
		id: "external-records",
		label: "External Records",
		description:
			"Where each client's school records request stands. Clients who don't need records are hidden unless you filter for them.",
	},
] as const;

type TableId = (typeof TABLES)[number]["id"];

function isTableId(value: string | null): value is TableId {
	return TABLES.some((table) => table.id === value);
}

export function DatabasePage() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const rawTable = searchParams.get("table");
	const tableId: TableId = isTableId(rawTable) ? rawTable : TABLES[0].id;
	const table = TABLES.find((t) => t.id === tableId) ?? TABLES[0];

	return (
		<div className="container mx-auto flex flex-col gap-4 p-4">
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<h1 className="text-2xl font-semibold">Database</h1>
					<p className="text-sm text-muted-foreground">{table.description}</p>
				</div>
				<Tabs
					onValueChange={(value) =>
						router.replace(`${pathname}?table=${value}`)
					}
					value={tableId}
				>
					<TabsList>
						{TABLES.map((t) => (
							<TabsTrigger key={t.id} value={t.id}>
								{t.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</div>

			{tableId === "questionnaires" ? (
				<QuestionnaireDataView />
			) : (
				<ExternalRecordsDataView />
			)}
		</div>
	);
}
