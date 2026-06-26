const CHECK_TIMEOUT_MS = 6000;
const FAILURE_CONFIRM_MS = 300000; // 5 minutes of sustained failure before failover

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

		if (request.method === "GET" && url.pathname === "/state") {
			const state = (await env.FAILOVER_KV.get("state")) || "normal";
			const updatedAt = (await env.FAILOVER_KV.get("state_updated_at")) || "";
			return Response.json({ state, updatedAt });
		}

		if (request.method === "POST" && url.pathname === "/ack") {
			const body = await request.json().catch(() => ({}));

			if (body.event === "failover_complete") {
				await env.FAILOVER_KV.put("state", "failover_active");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
				await slack(
					env,
					"Failover complete. Standby is active at emr.driftwoodeval.com.",
				);
			} else if (body.event === "failback_complete") {
				await env.FAILOVER_KV.put("state", "normal");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
				await slack(env, "Failback complete. Primary is live, system normal.");
			}
			return new Response("ok");
		}

		return new Response("Not found", { status: 404 });
	},
};

async function runCheck(env) {
	const state = (await env.FAILOVER_KV.get("state")) || "normal";

	if (state === "failover_active") {
		// Watch for primary coming back. No writes unless it does.
		const ok = await checkPrimary();
		if (ok) {
			const notified =
				(await env.FAILOVER_KV.get("primary_back_notified")) || "";
			if (!notified) {
				await env.FAILOVER_KV.put("primary_back_notified", "1");
				await slack(
					env,
					"Primary appears healthy again. Run failback.sh when ready.",
				);
			}
		}
		return;
	}

	if (state === "failover") {
		// Triggered but standby hasn't acked yet. Nothing to do.
		return;
	}

	// Normal state. Run health check.
	const ok = await checkPrimary();

	if (ok) {
		// Primary is healthy. If we had a pending failure recorded, clear it.
		const pending = await env.FAILOVER_KV.get("pending_failure");
		if (pending) {
			await env.FAILOVER_KV.delete("pending_failure");
			await env.FAILOVER_KV.delete("pending_failure_warned");
			await slack(env, "Primary recovered. Pending failure cleared.");
		}
		return;
	}

	// Primary is not healthy. Check if we already have a pending failure recorded.
	const pending = await env.FAILOVER_KV.get("pending_failure");

	if (!pending) {
		// First failure. Record the time and wait for next invocation to confirm.
		// No Slack yet -- single failed checks are too common to be worth notifying.
		await env.FAILOVER_KV.put("pending_failure", new Date().toISOString());
		return;
	}

	// Failure was already recorded. Check how long it has been failing.
	const failingSince = new Date(pending).getTime();
	const elapsed = Date.now() - failingSince;

	if (elapsed < FAILURE_CONFIRM_MS) {
		// Still within the confirmation window. Wait longer.
		const seconds = Math.round(elapsed / 1000);
		console.log(
			`Primary still down. Failing for ${seconds}s, waiting for ${FAILURE_CONFIRM_MS / 1000}s before failover.`,
		);

		// Warn once when we're past halfway to the failover threshold
		const halfwayMs = FAILURE_CONFIRM_MS / 2;
		const warned = await env.FAILOVER_KV.get("pending_failure_warned");
		if (elapsed >= halfwayMs && !warned) {
			await env.FAILOVER_KV.put("pending_failure_warned", "1");
			const remaining = Math.round((FAILURE_CONFIRM_MS - elapsed) / 1000);
			await slack(
				env,
				`Primary has been unhealthy for ${seconds}s. Failover will trigger in ~${remaining}s if it does not recover.`,
			);
		}
		return;
	}

	// Clear the warning flag before triggering
	await env.FAILOVER_KV.delete("pending_failure_warned");

	// Primary has been down for long enough. Trigger failover.
	await env.FAILOVER_KV.put("state", "failover");
	await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
	await env.FAILOVER_KV.delete("pending_failure");
	const minutes = Math.round(elapsed / 60000);
	await slack(
		env,
		`Primary has been down for ~${minutes} minute(s). Failover triggered. Standby activating within 30s.`,
	);
}

async function checkPrimary() {
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
