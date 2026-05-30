"use client";

import { IssuesAlert } from "@components/issues/issuesAlert";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Clock, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import { api } from "~/trpc/react";
import { IssueFormLink } from "../shared/IssueFormLink";
import { ThemeSwitcher } from "../shared/ThemeSwitcher";
import { GlobalClientSearch } from "./GlobalClientSearch";

export function HeaderActions() {
	const pathname = usePathname();
	const { data: session } = useSession();
	const can = useCheckPermission();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);

	const canQSuite =
		can("settings:qsuite:general") ||
		can("settings:qsuite:services") ||
		can("settings:qsuite:records") ||
		can("settings:qsuite:piecework");

	return (
		<div className="m-2 flex items-center gap-3">
			{session && pathname !== "/" && <GlobalClientSearch />}

			{session && !!recentClients?.length && (
				<Popover>
					<PopoverTrigger asChild>
						<Button size="icon" variant="ghost">
							<Clock className="h-4 w-4" />
							<span className="sr-only">Recent clients</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-64 p-2">
						<p className="mb-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Recent Clients
						</p>
						<div className="flex flex-col">
							{recentClients.map((client) => (
								<Link
									className="rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
									href={`/clients/${client.hash}`}
									key={client.hash}
								>
									{client.name}
								</Link>
							))}
						</div>
					</PopoverContent>
				</Popover>
			)}

			{session && <IssuesAlert />}

			<IssueFormLink />

			{isDesktop && <ThemeSwitcher />}

			{!session && (
				<Button onClick={() => signIn("google")} size="sm" variant="secondary">
					<span className="hidden sm:block">Sign in</span>

					<span className="block sm:hidden">
						<LogIn />
					</span>
				</Button>
			)}

			{session && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Avatar className="cursor-pointer shadow">
							<AvatarImage src={session.user?.image ?? ""} />
							<AvatarFallback>
								{session?.user?.name
									? session.user.name
											.split(" ")
											.map((n) => (n ?? "")[0]?.toUpperCase())
											.join("")
									: ""}
							</AvatarFallback>
						</Avatar>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<Link href="/settings">
							<DropdownMenuItem>Settings</DropdownMenuItem>
						</Link>
						{canQSuite && (
							<Link href="/qsuite-config">
								<DropdownMenuItem>QSuite Config</DropdownMenuItem>
							</Link>
						)}
						<DropdownMenuSeparator />
						<button className="w-full" onClick={() => signOut()} type="button">
							<DropdownMenuItem>Sign out</DropdownMenuItem>
						</button>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="font-mono font-normal text-[10px] text-muted-foreground">
							{process.env.NODE_ENV === "development" ? (
								<span>Branch: {process.env.NEXT_PUBLIC_GIT_BRANCH}</span>
							) : (
								<span>
									{process.env.NEXT_PUBLIC_COMMIT_HASH} •{" "}
									{process.env.NEXT_PUBLIC_BUILD_DATE
										? new Date(
												process.env.NEXT_PUBLIC_BUILD_DATE,
											).toLocaleDateString("en-US", {
												year: "2-digit",
												month: "numeric",
												day: "numeric",
											})
										: "n/a"}
								</span>
							)}
						</DropdownMenuLabel>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
