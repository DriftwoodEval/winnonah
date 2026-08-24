/**
 * Most mutation inputs carry the client they act on as a top-level `clientId`
 * field, since that's the convention used across the routers. Falls back to
 * null (not every action is client-specific, e.g. role or settings changes).
 */
export function extractClientId(rawInput: unknown): number | null {
	if (
		typeof rawInput === "object" &&
		rawInput !== null &&
		"clientId" in rawInput
	) {
		const clientId = (rawInput as { clientId: unknown }).clientId;
		if (typeof clientId === "number") return clientId;
	}
	return null;
}

/**
 * Records which fields a mutation submitted, never their values: many
 * mutations carry PHI (names, DOB, notes content, insurance info) in their
 * input, and the audit trail must not become a second place that leaks from.
 */
export function summarizeAuditInput(rawInput: unknown) {
	if (rawInput === undefined) return null;
	if (Array.isArray(rawInput))
		return { type: "array", length: rawInput.length };
	if (typeof rawInput === "object" && rawInput !== null) {
		return { fields: Object.keys(rawInput) };
	}
	return { type: typeof rawInput };
}
