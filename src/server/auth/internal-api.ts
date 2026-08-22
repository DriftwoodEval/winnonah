import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { redis } from "~/lib/redis";

const API_KEY = process.env.API_KEY;

const FAILURE_WINDOW_SECONDS = 5 * 60;
const MAX_FAILURES_PER_WINDOW = 10;

function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	// Buffers of different length still need a constant-time comparison against
	// something of the same length as `a`, otherwise the length mismatch itself
	// leaks via an early return.
	if (bufA.length !== bufB.length) {
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

/**
 * Shared auth check for internal server-to-server endpoints (py-config,
 * client-info) that dispense DB credentials / PHI to the questionnaires app.
 * Rate-limits failed attempts per source IP so a scan or leaked-key probe
 * shows up in Redis/logs instead of running unbounded.
 */
export async function checkInternalApiAuth(
	req: NextRequest,
): Promise<{ ok: true } | { ok: false; status: number }> {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const failureKey = `internal-api-auth-fail:${ip}`;

	const recentFailures = await redis.get(failureKey);
	if (recentFailures && Number(recentFailures) >= MAX_FAILURES_PER_WINDOW) {
		console.error(
			`Internal API rate limit exceeded for ${ip} on ${req.nextUrl.pathname}`,
		);
		return { ok: false, status: 429 };
	}

	const authHeader = req.headers.get("authorization") ?? "";
	const expected = `Bearer ${API_KEY}`;

	if (!API_KEY || !safeEqual(authHeader, expected)) {
		const count = await redis.incr(failureKey);
		if (count === 1) {
			await redis.expire(failureKey, FAILURE_WINDOW_SECONDS);
		}
		console.error(
			`Internal API auth failure from ${ip} on ${req.nextUrl.pathname} (${count} in window)`,
		);
		return { ok: false, status: 401 };
	}

	return { ok: true };
}
