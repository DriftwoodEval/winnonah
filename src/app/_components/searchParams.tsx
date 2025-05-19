"use client";

import { useSearchParams } from "next/navigation";

export default function SearchParams() {
	const searchParams = useSearchParams();
	return <div className="text-white">{searchParams.get("eval")}</div>;
}
