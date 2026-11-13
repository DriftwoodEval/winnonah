"use client";

import { HomeWidgetsEditor } from "@components/home/HomeCustomizer";
import { IssueListOrderEditor } from "@components/issues/IssueListCustomizer";
import { HeaderItemsCustomizer } from "@components/layout/HeaderItemsCustomizer";
import { ClientCardPreferences } from "@components/settings/ClientCardPreferences";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { useHomeWidgets } from "~/hooks/use-home-widgets";
import { useIssueListOrder } from "~/hooks/use-issue-list-order";

export default function MyPreferencesSettings() {
	const { widgets, isLoading, setWidgets } = useHomeWidgets();
	const { order, setOrder } = useIssueListOrder();

	return (
		<div className="flex flex-col gap-6">
			<p className="text-sm text-muted-foreground">
				These settings only change what you see. Changes save as you make them.
			</p>
			<Card>
				<CardHeader>
					<CardTitle>Client Hover Card</CardTitle>
				</CardHeader>
				<CardContent>
					<ClientCardPreferences />
				</CardContent>
			</Card>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Header</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<HeaderItemsCustomizer />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Home Page</CardTitle>
					</CardHeader>
					<CardContent>
						{!isLoading && (
							<HomeWidgetsEditor onChange={setWidgets} widgets={widgets} />
						)}
					</CardContent>
				</Card>
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle>Issue Lists</CardTitle>
					</CardHeader>
					<CardContent>
						<IssueListOrderEditor
							className="grid grid-cols-1 gap-6 space-y-0 md:grid-cols-2"
							onChange={setOrder}
							order={order}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
