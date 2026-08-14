"use client";

import { AvailabilityForm } from "@components/availability/AvailabilityForm";
import { AvailabilityList } from "@components/availability/AvailabilityList";
import { TeamAvailability } from "@components/availability/TeamAvailability";
import { Separator } from "@ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function AvailabilityPageTabs() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const urlTab = searchParams.get("tab") ?? "mine";
	const [activeTab, setActiveTab] = useState(urlTab);

	useEffect(() => {
		setActiveTab(urlTab);
	}, [urlTab]);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<Tabs
			className="w-full max-w-6xl"
			onValueChange={handleTabChange}
			value={activeTab}
		>
			<TabsList>
				<TabsTrigger value="mine">My Availability</TabsTrigger>
				<TabsTrigger value="team">Team Availability</TabsTrigger>
			</TabsList>

			<TabsContent value="mine">
				<div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
					<AvailabilityForm />
					<Separator className="lg:hidden" />
					<AvailabilityList />
				</div>
			</TabsContent>

			<TabsContent value="team">
				<TeamAvailability />
			</TabsContent>
		</Tabs>
	);
}
