import { Guard } from "@components/layout/Guard";
import { LoginsViewer } from "@components/logins/LoginsViewer";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Logins",
};

export default function Page() {
	return (
		<Guard>
			<div className="mx-4 my-6 flex w-full flex-col gap-6 sm:mx-10 sm:my-10">
				<LoginsViewer />
			</div>
		</Guard>
	);
}
