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
 * Records the mutation's submitted input verbatim, including values, since
 * an audit trail that only names which fields changed can't show what
 * actually happened. Access to the log is restricted to the
 * settings:audit-log:view permission, so this relies on that gate rather
 * than on omitting the data.
 */
export function serializeAuditInput(rawInput: unknown) {
	if (rawInput === undefined) return null;
	return rawInput;
}
