"use client";

import { IssuesAlert } from "@components/issues/issuesAlert";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ThemeSwitcher } from "../shared/ThemeSwitcher";
import { GlobalClientSearch } from "./GlobalClientSearch";

export function HeaderActions() {
	const pathname = usePathname();
	const { data: session } = useSession();

	return (
		<div className="m-2 flex items-center gap-3">
			{session && pathname !== "/" && <GlobalClientSearch />}

			{session && <IssuesAlert />}

			<ThemeSwitcher />

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
						<Avatar className="cursor-pointer">
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
						<DropdownMenuSeparator />
						<button className="w-full" onClick={() => signOut()} type="button">
							<DropdownMenuItem>Sign out</DropdownMenuItem>
						</button>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
