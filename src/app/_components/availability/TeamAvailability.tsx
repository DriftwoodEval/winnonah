"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { AvailabilityList } from "./AvailabilityList";
import { TeamMonthView } from "./TeamMonthView";

function PersonView() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { data: session } = useSession();

	const urlEmail = searchParams.get("email") ?? undefined;
	const [selectedEmail, setSelectedEmail] = useState(urlEmail);

	useEffect(() => {
		setSelectedEmail(urlEmail);
	}, [urlEmail]);

	const { data: users } = api.users.getAll.useQuery({ archived: false });

	const otherUsers = (users ?? [])
		.filter((u) => u.email && u.email !== session?.user?.email)
		.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

	const handleEmailChange = (value: string) => {
		setSelectedEmail(value);
		const params = new URLSearchParams(searchParams.toString());
		params.set("email", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<div className="flex flex-col gap-4">
			<Select onValueChange={handleEmailChange} value={selectedEmail}>
				<SelectTrigger className="w-[280px]">
					<SelectValue placeholder="Select a person" />
				</SelectTrigger>
				<SelectContent>
					{otherUsers.map((u) => (
						<SelectItem key={u.id} value={u.email as string}>
							{u.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{selectedEmail ? (
				<AvailabilityList
					email={selectedEmail}
					key={selectedEmail}
					readOnly
					title={`${otherUsers.find((u) => u.email === selectedEmail)?.name ?? ""}'s Availability`}
				/>
			) : (
				<p className="text-muted-foreground">
					Select a person to view their availability.
				</p>
			)}
		</div>
	);
}

export function TeamAvailability() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const urlView = searchParams.get("view") ?? "month";
	const [view, setView] = useState(urlView);

	useEffect(() => {
		setView(urlView);
	}, [urlView]);

	const handleViewChange = (value: string) => {
		setView(value);
		const params = new URLSearchParams(searchParams.toString());
		params.set("view", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<Tabs onValueChange={handleViewChange} value={view}>
			<TabsList>
				<TabsTrigger value="month">Month Overview</TabsTrigger>
				<TabsTrigger value="person">By Person</TabsTrigger>
			</TabsList>

			<TabsContent className="mt-4" value="month">
				<TeamMonthView />
			</TabsContent>

			<TabsContent className="mt-4" value="person">
				<PersonView />
			</TabsContent>
		</Tabs>
	);
}
