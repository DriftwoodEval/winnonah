import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

describe("getClientIp", () => {
	it("prefers the Cloudflare header", () => {
		const headers = new Headers({
			"cf-connecting-ip": "203.0.113.7",
			"x-forwarded-for": "172.18.0.5",
		});
		expect(getClientIp(headers)).toBe("203.0.113.7");
	});

	it("falls back to the address Caddy saw for calls that skip Cloudflare", () => {
		expect(getClientIp(new Headers({ "x-forwarded-for": "172.18.0.5" }))).toBe(
			"172.18.0.5",
		);
	});

	it("takes the entry the nearest proxy added from a forwarded chain", () => {
		const headers = new Headers({
			"x-forwarded-for": "198.51.100.1, 172.18.0.5",
		});
		expect(getClientIp(headers)).toBe("172.18.0.5");
	});

	it("returns unknown when no header carries an address", () => {
		expect(getClientIp(new Headers())).toBe("unknown");
	});
});
