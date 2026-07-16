import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { IMPERSONATION_COOKIE } from "~/server/auth/impersonation";

export async function POST(request: Request) {
	if (process.env.NODE_ENV !== "development") {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const { userId } = (await request.json()) as { userId?: string | null };
	const store = await cookies();

	if (userId) {
		store.set(IMPERSONATION_COOKIE, userId, { httpOnly: true, path: "/" });
	} else {
		store.delete(IMPERSONATION_COOKIE);
	}

	return NextResponse.json({ ok: true });
}
