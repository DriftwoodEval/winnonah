import Link from "next/link";

import { Clients } from "~/app/_components/clients";
import { IssuesAlert } from "~/app/_components/issuesAlert";
import SearchForm from "~/app/_components/searchForm";
import { auth } from "~/server/auth";
import { HydrateClient } from "~/trpc/server";
import { Button } from "./_components/ui/button";

export default async function Home() {
	const session = await auth();

	return (
		<HydrateClient>
			<main className="flex min-h-screen flex-col items-center justify-center">
				<div className="absolute top-0 right-0 m-2 flex gap-3">
					<IssuesAlert />
					<Link href={session ? "/api/auth/signout" : "/api/auth/signin"}>
						<Button>{session ? "Sign out" : "Sign in"}</Button>
					</Link>
				</div>
				<div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
						{session?.user && <Clients />}
						{session?.user && <SearchForm />}
					</div>
				</div>
			</main>
		</HydrateClient>
	);
}
