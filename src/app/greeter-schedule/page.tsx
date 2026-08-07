import GreeterSchedule from "@components/greeter-schedule/GreeterSchedule";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Greeter Schedule",
};

export default async function Page() {
	return (
		<Guard>
			<div className="flex grow flex-col items-center gap-4 px-4 py-6 pt-16">
				<GreeterSchedule />
			</div>
		</Guard>
	);
}
