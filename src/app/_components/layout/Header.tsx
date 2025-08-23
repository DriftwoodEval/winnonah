import Link from "next/link";
import { metadata } from "~/app/layout";
import { HeaderActions } from "./HeaderActions";

export async function Header() {
	return (
		<header className="fixed top-0 z-50 flex h-10 w-full items-center justify-between bg-background">
			<Link href="/">
				<h1 className="m-2 font-bold text-2xl">{metadata.title as string}</h1>
			</Link>
			<HeaderActions />
		</header>
	);
}
