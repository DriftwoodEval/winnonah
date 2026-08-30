import { redirect } from "next/navigation";

// The claim workflow now lives on the unified /reports page.
export default function Page() {
	redirect("/reports");
}
