const FAILURE_THRESHOLD = 3;
const CHECK_TIMEOUT_MS = 6000;

export default {
	async scheduled(_event, env, ctx) {
		ctx.waitUntil(runCheck(env));
	},

	async fetch(request, env) {
		const url = new URL(request.url);
		const secret = request.headers.get("X-Monitor-Secret");
		if (secret !== env.MONITOR_SECRET) {
			return new Response("Forbidden", { status: 403 });
		}

		// Standby polls this to decide whether to failover
		if (request.method === "GET" && url.pathname === "/state") {
			const state = (await env.FAILOVER_KV.get("state")) || "normal";
			const failures = (await env.FAILOVER_KV.get("failure_count")) || "0";
			const updatedAt = (await env.FAILOVER_KV.get("state_updated_at")) || "";
			return Response.json({
				state,
				failures: parseInt(failures, 10),
				updatedAt,
			});
		}

		// failover.sh and failback.sh post here to update state
		if (request.method === "POST" && url.pathname === "/ack") {
			const body = await request.json().catch(() => ({}));

			if (body.event === "failover_complete") {
				await env.FAILOVER_KV.put("state", "failover_active");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
				await slack(
					env,
					"✅ *Failover complete*, standby confirmed active at emr.driftwoodeval.com.",
				);
			} else if (body.event === "failback_complete") {
				await env.FAILOVER_KV.put("state", "normal");
				await env.FAILOVER_KV.put("failure_count", "0");
				await env.FAILOVER_KV.put("primary_back_notified", "");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
				await slack(
					env,
					"✅ *Failback complete*, primary is live, system normal.",
				);
			}
			return new Response("ok");
		}

		return new Response("Not found", { status: 404 });
	},
};

async function runCheck(env) {
	const state = (await env.FAILOVER_KV.get("state")) || "normal";

	if (state === "failover_active") {
		// Watch for primary coming back, but don't auto-failback
		const ok = await checkPrimary(env);
		if (ok) {
			const alreadyNotified = await env.FAILOVER_KV.get(
				"primary_back_notified",
			);
			if (!alreadyNotified) {
				await env.FAILOVER_KV.put("primary_back_notified", "1");
				await slack(
					env,
					"🟡 Primary (emr.driftwoodeval.com) appears healthy again. Run `failback.sh` when ready.",
				);
			}
		}
		return;
	}

	const ok = await checkPrimary(env);
	if (ok) {
		await env.FAILOVER_KV.put("failure_count", "0");
		return;
	}

	const prev = parseInt(
		(await env.FAILOVER_KV.get("failure_count")) || "0",
		10,
	);
	const next = prev + 1;
	await env.FAILOVER_KV.put("failure_count", String(next));
	console.log(`Health check failed (${next}/${FAILURE_THRESHOLD})`);

	if (next === 1) {
		await slack(
			env,
			`⚠️ emr.driftwoodeval.com health check failing (${next}/${FAILURE_THRESHOLD})...`,
		);
	}
	if (next >= FAILURE_THRESHOLD) {
		await env.FAILOVER_KV.put("state", "failover");
		await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
		await slack(
			env,
			`🔴 *Primary is DOWN* (${next} consecutive failures). Failover triggered, standby activating within 30s.`,
		);
	}
}

async function checkPrimary(_env) {
	try {
		const res = await fetch("https://emr.driftwoodeval.com/api/health", {
			signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
		});
		return res.ok;
	} catch {
		return false;
	}
}

async function slack(env, msg) {
	if (!env.SLACK_WEBHOOK_URL) return;
	await fetch(env.SLACK_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text: msg }),
	}).catch(() => {});
}
