import { NextResponse } from "next/server";
import { env } from "~/env";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";

/** Streams the completed DDS fax for a request from the Python sidecar. */
export const GET = auth(async (req, { params }) => {
	if (!req.auth) {
		return new NextResponse("Unauthorized", { status: 401 });
	}
	if (!hasPermission(req.auth.user.permissions, "issues:dds-requests")) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	const { id } = (await params) as { id: string };
	if (!/^\d+$/.test(id)) {
		return new NextResponse("Invalid id", { status: 400 });
	}

	const res = await fetch(`${env.PY_API}/dds-requests/${id}/preview`, {
		headers: { Cookie: req.headers.get("cookie") ?? "" },
	}).catch(() => null);
	if (!res) {
		return new NextResponse("Could not reach the fax service", { status: 502 });
	}
	if (!res.ok) {
		const { detail } = (await res.json().catch(() => ({}))) as {
			detail?: string;
		};
		return new NextResponse(detail ?? "Could not build the fax", {
			status: res.status,
		});
	}
	return new NextResponse(await res.arrayBuffer(), {
		headers: { "Content-Type": "application/pdf" },
	});
});
