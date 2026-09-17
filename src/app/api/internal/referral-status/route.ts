import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
	getReferralStatusSummary,
	type NextRealAppointment,
} from "~/lib/dashboard";
import { getFullDashboardData } from "~/lib/dashboard-data";
import { getServiceSession } from "~/lib/dashboard-history";
import { redis } from "~/lib/redis";
import { db } from "~/server/db";
import { appointments } from "~/server/db/schema";

const API_KEY = process.env.API_KEY;
const IGNORED_REFERRAL_SOURCES = new Set(["no referral source", "unknown", ""]);

/** Each active client's soonest real (non-cancelled, non-rescheduled,
 * non-placeholder, non-billing-only) upcoming appointment, keyed by client id. */
async function getNextRealAppointments(
	clientIds: number[],
): Promise<Map<number, NextRealAppointment>> {
	if (clientIds.length === 0) return new Map();

	const rows = await db
		.select({
			clientId: appointments.clientId,
			startTime: appointments.startTime,
			daEval: appointments.daEval,
		})
		.from(appointments)
		.where(
			and(
				inArray(appointments.clientId, clientIds),
				gte(appointments.startTime, new Date()),
				eq(appointments.cancelled, false),
				eq(appointments.rescheduled, false),
				eq(appointments.placeholder, false),
				eq(appointments.billingOnly, false),
			),
		)
		.orderBy(asc(appointments.startTime));

	const nextByClientId = new Map<number, NextRealAppointment>();
	for (const row of rows) {
		if (nextByClientId.has(row.clientId)) continue;
		nextByClientId.set(row.clientId, {
			startTime: row.startTime,
			daEval: row.daEval,
		});
	}
	return nextByClientId;
}

export async function GET(req: NextRequest) {
	const authHeader = req.headers.get("authorization");
	if (authHeader !== `Bearer ${API_KEY}`) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const session = await getServiceSession();
	const { punchClients } = await getFullDashboardData({ db, redis, session });

	const eligibleClients = (punchClients ?? []).filter((client) => {
		if (client.status === false) return false;
		const source = client.referralSource?.trim().toLowerCase();
		return !!source && !IGNORED_REFERRAL_SOURCES.has(source);
	});

	const nextAppointments = await getNextRealAppointments(
		eligibleClients.map((c) => c.id),
	);

	const results = eligibleClients.map((client) => {
		const { statusText, done } = getReferralStatusSummary(
			client,
			nextAppointments.get(client.id),
		);
		return {
			clientId: client.id,
			fullName: client.fullName ?? client["Client Name"] ?? String(client.id),
			referralSource: client.referralSource,
			addedDate: client.addedDate,
			statusText,
			done,
		};
	});

	return NextResponse.json(results);
}
