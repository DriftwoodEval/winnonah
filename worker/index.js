const CHECK_TIMEOUT_MS = 6000;
const FAILURE_CONFIRM_MS = 180000; // 3 minutes of sustained failure before failover

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
			const slackTs = (await env.FAILOVER_KV.get("slack_ts")) || "";
			const slackText = (await env.FAILOVER_KV.get("slack_text")) || "";
			return Response.json({ state, updatedAt, slackTs, slackText });
		}

		if (request.method === "POST" && url.pathname === "/ack") {
			const body = await request.json().catch(() => ({}));

			if (body.event === "failover_complete") {
				await env.FAILOVER_KV.put("state", "failover_active");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
				// failover.sh has been editing the Slack message and posts the
				// final status itself.
				await slackEnd(env);
			} else if (body.event === "failback_complete") {
				await env.FAILOVER_KV.put("state", "normal");
				await env.FAILOVER_KV.put("state_updated_at", new Date().toISOString());
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
				await slackAlert(
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
			const warned = await env.FAILOVER_KV.get("pending_failure_warned");
			await env.FAILOVER_KV.delete("pending_failure");
			await env.FAILOVER_KV.delete("pending_failure_warned");
			if (warned) {
				await slack(env, "Primary recovered.");
				await slackEnd(env);
			}
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
		`Primary has been down for ~${minutes} minute(s). Failover triggered, standby activating within 30s.`,
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

// One Slack message per incident, edited as it progresses. slack() appends a
// line to it (posting it first if needed) and keeps its ts and text in KV so
// the standby can pick it up through /state. slackAlert() posts a separate
// message, because edits don't notify anyone. slackEnd() closes the incident.
async function slack(env, line) {
	if (!env.SLACK_BOT_TOKEN) return;
	const ts = await env.FAILOVER_KV.get("slack_ts");
	const previous = (await env.FAILOVER_KV.get("slack_text")) || "";
	const text = previous ? `${previous}\n${line}` : line;
	const newTs = await slackCall(env, text, ts);
	await env.FAILOVER_KV.put("slack_ts", newTs || ts || "");
	await env.FAILOVER_KV.put("slack_text", text);
}

async function slackAlert(env, text) {
	if (!env.SLACK_BOT_TOKEN) return;
	await slackCall(env, text, null);
}

async function slackEnd(env) {
	await env.FAILOVER_KV.delete("slack_ts");
	await env.FAILOVER_KV.delete("slack_text");
}

// Posts text, or edits message `ts` when given. Returns the message ts.
async function slackCall(env, text, ts) {
	const res = await fetch(
		`https://slack.com/api/${ts ? "chat.update" : "chat.postMessage"}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
				"Content-Type": "application/json; charset=utf-8",
			},
			body: JSON.stringify({
				channel: env.SLACK_CHANNEL_ID,
				text,
				...(ts && { ts }),
			}),
		},
	).catch(() => null);
	const data = await res?.json().catch(() => null);
	return data?.ts ?? null;
}
