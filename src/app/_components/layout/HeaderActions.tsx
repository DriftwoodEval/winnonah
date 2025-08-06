"use client";

import { IssuesAlert } from "@components/issues/issuesAlert";
import { Button } from "@ui/button";
import { LogIn, LogOut } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalClientSearch } from "./GlobalClientSearch";

export function HeaderActions({ session }: { session: Session | null }) {
	const pathname = usePathname();

	return (
		<div className="m-2 flex items-center gap-3">
			{pathname !== "/" && <GlobalClientSearch />}

			{session && <IssuesAlert />}

			<Link href={session ? "/api/auth/signout" : "/api/auth/signin"}>
				<Button size="sm" variant="secondary">
					<span className="hidden sm:block">
						{session ? "Sign out" : "Sign in"}
					</span>
					<span className="block sm:hidden">
						{session ? <LogOut /> : <LogIn />}
					</span>
				</Button>
			</Link>
		</div>
	);
}
