import Link from "next/link";
import { metadata } from "~/app/layout";
import { HeaderActions } from "./HeaderActions";
import NavigationLinks from "./NavigationLinks";

export async function Header() {
	return (
		<header className="fixed top-0 z-50 flex h-10 w-full items-center justify-between bg-background">
			<div className="m-2 flex gap-4" style={{ alignItems: "baseline" }}>
				<Link href="/">
					<h1 className="hidden font-bold text-2xl lg:block">
						{metadata.title as string}
					</h1>
					<h1 className="block font-black text-2xl lg:hidden">
						{(metadata.title as string) ? (metadata.title as string)[0] : ""}
					</h1>
				</Link>
				{process.env.NODE_ENV !== "production" && <NavigationLinks />}
			</div>
			<HeaderActions />
		</header>
	);
}
