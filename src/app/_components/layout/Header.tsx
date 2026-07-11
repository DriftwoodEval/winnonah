import Link from "next/link";
import { env } from "~/env";
import { HeaderActions } from "./HeaderActions";
import NavigationLinks from "./NavigationLinks";

export async function Header() {
	const title = env.NEXT_PUBLIC_APP_TITLE;

	return (
		<header className="fixed top-0 z-50 flex h-10 w-full items-center justify-between bg-background">
			<div className="m-2 flex items-center gap-4">
				<Link className="shrink-0" href="/">
					<h1 className="hidden whitespace-nowrap font-bold text-2xl lg:block">
						{title}
					</h1>
					<h1 className="block font-black text-2xl lg:hidden">{title[0]}</h1>
				</Link>
				<NavigationLinks />
			</div>
			<HeaderActions />
		</header>
	);
}
