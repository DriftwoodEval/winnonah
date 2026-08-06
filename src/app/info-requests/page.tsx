import { InfoRequestList } from "@components/info-requests/InfoRequestList";
import { Guard } from "@components/layout/Guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Info Requests",
};

export default async function Page() {
	return (
		<Guard permission="info-requests:review">
			<div className="mx-10 my-10 flex w-full flex-col gap-6">
				<h1 className="font-bold text-2xl">Info Requests</h1>
				<InfoRequestList />
			</div>
		</Guard>
	);
}
