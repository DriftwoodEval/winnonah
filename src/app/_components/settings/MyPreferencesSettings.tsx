"use client";

import { HomeWidgetsEditor } from "@components/home/HomeCustomizer";
import { IssueListOrderEditor } from "@components/issues/IssueListCustomizer";
import { HeaderItemsCustomizer } from "@components/layout/HeaderItemsCustomizer";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { useHomeWidgets } from "~/hooks/use-home-widgets";
import { useIssueListOrder } from "~/hooks/use-issue-list-order";

export default function MyPreferencesSettings() {
	const { widgets, isLoading, setWidgets } = useHomeWidgets();
	const { order, setOrder } = useIssueListOrder();

	return (
		<div className="flex flex-col gap-6">
			<p className="text-muted-foreground text-sm">
				These settings only change what you see. Changes save as you make them.
			</p>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
				<Card>
					<CardHeader>
						<CardTitle>Issue Lists</CardTitle>
					</CardHeader>
					<CardContent>
						<IssueListOrderEditor onChange={setOrder} order={order} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
