import { Guard } from "@components/layout/Guard";
import { ReferralFaxList } from "@components/referral-faxes/ReferralFaxList";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Referral Faxes",
};

export default async function Page() {
	return (
		<Guard permission="referrals:fax:review">
			<div className="mx-10 my-10 flex w-full flex-col gap-6">
				<h1 className="font-bold text-2xl">Referral Faxes</h1>
				<ReferralFaxList />
			</div>
		</Guard>
	);
}
