/**
 * Headers that carry the real client address, in the order they are trusted.
 *
 * The app is only reachable through a Cloudflare tunnel into Caddy, and
 * Cloudflare sets `CF-Connecting-IP` itself, replacing anything the client
 * sent. Caddy overwrites `X-Forwarded-For` with the address it received the
 * request from, so for requests that come straight from another container
 * (not through Cloudflare) that is the caller's own address.
 */
export const CLIENT_IP_HEADERS = ["cf-connecting-ip", "x-forwarded-for"];

/** The client's address, or "unknown" when no trusted header carries one. */
export function getClientIp(headers: Headers): string {
	for (const name of CLIENT_IP_HEADERS) {
		// A forwarded chain lists the nearest proxy last, which is the most
		// trustworthy entry.
		const address = headers.get(name)?.split(",").at(-1)?.trim();
		if (address) return address;
	}
	return "unknown";
}
