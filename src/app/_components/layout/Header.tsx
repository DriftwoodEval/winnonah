import Link from "next/link";
import { HeaderActions } from "./HeaderActions";
import NavigationLinks from "./NavigationLinks";

export async function Header() {
	const title = "Winnonah";

	return (
		<header className="fixed top-0 z-50 flex h-10 w-full items-center justify-between bg-background">
			<div className="m-2 flex gap-4" style={{ alignItems: "baseline" }}>
				<Link href="/">
					<h1 className="hidden font-bold text-2xl lg:block">{title}</h1>
					<h1 className="block font-black text-2xl lg:hidden">{title[0]}</h1>
				</Link>
				<NavigationLinks />
			</div>
			<HeaderActions />
		</header>
	);
}
