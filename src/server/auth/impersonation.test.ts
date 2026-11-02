import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { testUtils } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImpersonatedBy, impersonation } from "./impersonation";

const canImpersonate = vi.fn();
const onEvent = vi.fn();

/** Keeps the cookies a browser would, so one call's cookies reach the next. */
class CookieJar {
	private cookies = new Map<string, string>();

	constructor(initial: { name: string; value: string }[] = []) {
		for (const { name, value } of initial) this.cookies.set(name, value);
	}

	apply(headers: Headers) {
		for (const line of headers.getSetCookie()) {
			const [pair = "", ...attributes] = line.split(";");
			const separator = pair.indexOf("=");
			const name = pair.slice(0, separator).trim();
			const value = pair.slice(separator + 1).trim();
			const removed = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
			if (removed || !value) this.cookies.delete(name);
			else this.cookies.set(name, value);
		}
	}

	has(name: string) {
		return this.cookies.has(name);
	}

	get(name: string) {
		return this.cookies.get(name);
	}

	get headers() {
		const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
		return new Headers({ cookie });
	}
}

async function setup() {
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "test-secret-test-secret-test-secret",
		database: memoryAdapter({}),
		plugins: [impersonation({ canImpersonate, onEvent }), testUtils()],
	});
	const context = await auth.$context;
	const test = context.test;

	const admin = await test.saveUser(
		test.createUser({ email: "admin@example.com", name: "Admin" }),
	);
	const bob = await test.saveUser(
		test.createUser({ email: "bob@example.com", name: "Bob" }),
	);
	const carol = await test.saveUser(
		test.createUser({ email: "carol@example.com", name: "Carol" }),
	);

	const login = await test.login({ userId: admin.id });
	const jar = new CookieJar(login.cookies);
	const names = {
		session: context.authCookies.sessionToken.name,
		dontRemember: context.authCookies.dontRememberToken.name,
		real: context.createAuthCookie("real_session").name,
	};

	async function start(userId: string) {
		const { headers } = await auth.api.startImpersonating({
			headers: jar.headers,
			body: { userId },
			returnHeaders: true,
		});
		jar.apply(headers);
	}

	async function stop() {
		const { headers } = await auth.api.stopImpersonating({
			headers: jar.headers,
			returnHeaders: true,
		});
		jar.apply(headers);
	}

	async function whoAmI() {
		const session = await auth.api.getSession({ headers: jar.headers });
		return session?.user.id ?? null;
	}

	return { auth, context, admin, bob, carol, jar, names, start, stop, whoAmI };
}

beforeEach(() => {
	canImpersonate.mockReset().mockResolvedValue(true);
	onEvent.mockReset().mockResolvedValue(undefined);
});

describe("starting to view as another user", () => {
	it("refuses a user who may not", async () => {
		const { bob, start, whoAmI, admin } = await setup();
		canImpersonate.mockResolvedValue(false);

		await expect(start(bob.id)).rejects.toMatchObject({ statusCode: 403 });

		expect(canImpersonate).toHaveBeenCalledWith(admin.id);
		expect(await whoAmI()).toBe(admin.id);
		expect(onEvent).not.toHaveBeenCalled();
	});

	it("refuses to view as yourself", async () => {
		const { admin, start } = await setup();
		await expect(start(admin.id)).rejects.toMatchObject({ statusCode: 400 });
	});

	it("refuses a user that does not exist", async () => {
		const { start } = await setup();
		await expect(start("nobody")).rejects.toMatchObject({ statusCode: 404 });
	});

	it("signs the browser in as the target and keeps the real session aside", async () => {
		const { admin, bob, jar, names, start, whoAmI } = await setup();
		const realToken = jar.get(names.session);

		await start(bob.id);

		expect(await whoAmI()).toBe(bob.id);
		expect(jar.get(names.session)).not.toBe(realToken);
		expect(jar.has(names.real)).toBe(true);
		// The view-as session must not renew, so the one-hour cap holds.
		expect(jar.has(names.dontRemember)).toBe(true);
		expect(onEvent).toHaveBeenCalledWith({
			action: "impersonation.started",
			userId: admin.id,
			userEmail: admin.email,
			targetUserId: bob.id,
			targetEmail: bob.email,
		});
	});

	it("marks the session with the real user and caps it at an hour", async () => {
		const { admin, bob, auth, context, jar, start } = await setup();
		await start(bob.id);

		const session = await auth.api.getSession({ headers: jar.headers });
		const stored = await context.internalAdapter.findSession(
			session?.session.token ?? "",
		);

		expect(getImpersonatedBy(stored?.session ?? {})).toBe(admin.id);
		const secondsLeft =
			((stored?.session.expiresAt.getTime() ?? 0) - Date.now()) / 1000;
		expect(secondsLeft).toBeGreaterThan(3500);
		expect(secondsLeft).toBeLessThanOrEqual(3600);
	});

	it("switches straight to another user, checking the real user and keeping the real session", async () => {
		const { admin, bob, carol, jar, names, start, stop, whoAmI } =
			await setup();
		await start(bob.id);
		const realSessionCookie = jar.get(names.real);
		const bobsSession = jar.get(names.session);

		canImpersonate.mockClear();
		await start(carol.id);

		expect(canImpersonate).toHaveBeenCalledWith(admin.id);
		expect(await whoAmI()).toBe(carol.id);
		expect(jar.get(names.real)).toBe(realSessionCookie);
		expect(jar.get(names.session)).not.toBe(bobsSession);

		await stop();
		expect(await whoAmI()).toBe(admin.id);
	});
});

describe("stopping", () => {
	it("returns to the real session and lets it renew again", async () => {
		const { admin, bob, jar, names, start, stop, whoAmI } = await setup();
		const realToken = jar.get(names.session);
		await start(bob.id);

		await stop();

		expect(await whoAmI()).toBe(admin.id);
		// The login helper gives the cookie unescaped, and the response escapes it.
		expect(decodeURIComponent(jar.get(names.session) ?? "")).toBe(
			decodeURIComponent(realToken ?? ""),
		);
		expect(jar.has(names.real)).toBe(false);
		expect(jar.has(names.dontRemember)).toBe(false);
		expect(onEvent).toHaveBeenLastCalledWith({
			action: "impersonation.stopped",
			userId: admin.id,
			userEmail: admin.email,
			targetUserId: bob.id,
			targetEmail: bob.email,
		});
	});

	it("ends the view-as session", async () => {
		const { bob, auth, context, jar, start, stop } = await setup();
		await start(bob.id);
		const viewing = await auth.api.getSession({ headers: jar.headers });

		await stop();

		expect(
			await context.internalAdapter.findSession(viewing?.session.token ?? ""),
		).toBeNull();
	});

	it("refuses when not viewing as anyone", async () => {
		const { stop } = await setup();
		await expect(stop()).rejects.toMatchObject({ statusCode: 400 });
	});

	it("tells the user to sign in again when the real session ran out", async () => {
		const { admin, bob, context, jar, names, start, stop } = await setup();
		const realToken = (jar.get(names.session) ?? "").split(".")[0] ?? "";
		await start(bob.id);
		await context.internalAdapter.updateSession(decodeURIComponent(realToken), {
			expiresAt: new Date(Date.now() - 1000),
		});

		await expect(stop()).rejects.toMatchObject({ statusCode: 401 });
		expect(admin.id).toBeDefined();
	});
});

describe("signing out", () => {
	it("clears the saved real session too", async () => {
		const { bob, auth, jar, names, start } = await setup();
		await start(bob.id);

		const { headers } = await auth.api.signOut({
			headers: jar.headers,
			returnHeaders: true,
		});
		jar.apply(headers);

		expect(jar.has(names.real)).toBe(false);
		expect(jar.has(names.session)).toBe(false);
	});
});
