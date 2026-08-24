const MAX_INPUT_LENGTH = 5000;

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
 * Caps the serialized size of the logged input so a large payload (e.g. note
 * content, a file upload) doesn't bloat the audit table.
 */
export function serializeAuditInput(rawInput: unknown) {
	if (rawInput === undefined) return null;
	const serialized = JSON.stringify(rawInput);
	if (serialized === undefined) return null;
	if (serialized.length <= MAX_INPUT_LENGTH) return rawInput;
	return {
		truncated: true,
		length: serialized.length,
		preview: serialized.slice(0, MAX_INPUT_LENGTH),
	};
}
