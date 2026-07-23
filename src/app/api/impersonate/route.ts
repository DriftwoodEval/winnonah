import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasPermission } from "~/lib/utils";
import { auth } from "~/server/auth";
import { IMPERSONATION_COOKIE } from "~/server/auth/impersonation";

export async function POST(request: Request) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { userId } = (await request.json()) as { userId?: string | null };
	const store = await cookies();

	if (!userId) {
		store.delete(IMPERSONATION_COOKIE);
		return NextResponse.json({ ok: true });
	}

	if (!hasPermission(session.user.permissions, "settings:impersonate")) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	store.set(IMPERSONATION_COOKIE, userId, { httpOnly: true, path: "/" });
	return NextResponse.json({ ok: true });
}
