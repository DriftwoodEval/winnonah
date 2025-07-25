import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { metadata } from "~/app/layout";
import { auth } from "~/server/auth";
import { IssuesAlert } from "./issuesAlert";
import { Button } from "./ui/button";

export async function Header() {
	const session = await auth();
	return (
		<div className="sticky flex w-full items-center justify-between">
			<Link href="/">
				<h1 className="m-2 font-bold text-2xl">{metadata.title as string}</h1>
			</Link>
			<div className="m-2 flex items-center gap-3">
				{session?.user && <IssuesAlert />}
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
		</div>
	);
}
