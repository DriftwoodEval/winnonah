"use client";

import { IssuesAlert } from "@components/issues/issuesAlert";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import { LogIn } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { GlobalClientSearch } from "./GlobalClientSearch";

export function HeaderActions() {
	const pathname = usePathname();
	const { data: session } = useSession();

	return (
		<div className="m-2 flex items-center gap-3">
			{session && pathname !== "/" && <GlobalClientSearch />}

			{session && <IssuesAlert />}

			{!session && (
				<Link href="/api/auth/signin">
					<Button size="sm" variant="secondary">
						<span className="hidden sm:block">Sign in</span>

						<span className="block sm:hidden">
							<LogIn />
						</span>
					</Button>
				</Link>
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
						<Link href="/api/auth/signout">
							<DropdownMenuItem>Sign out</DropdownMenuItem>
						</Link>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
