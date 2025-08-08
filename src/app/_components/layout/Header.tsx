import Link from "next/link";
import { metadata } from "~/app/layout";
import { HeaderActions } from "./HeaderActions";

export async function Header() {
	return (
		<div className="sticky flex w-full items-center justify-between">
			<Link href="/">
				<h1 className="m-2 font-bold text-2xl">{metadata.title as string}</h1>
			</Link>
			<HeaderActions />
		</div>
	);
}
