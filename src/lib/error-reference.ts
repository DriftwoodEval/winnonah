// Reference shown on the error pages. Server errors carry a digest that
// matches the server logs. Browser errors have none, so fall back to the
// time of the error, which staff can quote and we can match against logs.
export function getErrorReference(error: { digest?: string }): string {
	return error.digest ?? `client-${new Date().toISOString()}`;
}
