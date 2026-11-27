/**
 * Mutation options that retry a dropped connection (the server sent no
 * response, so the error has no `data`) up to twice. Spread into `useMutation`
 * only for mutations that end in the same state when run twice, because the
 * first attempt may have saved before the connection dropped.
 */
export const retryNetworkError = {
	retry: (failureCount: number, error: { data?: unknown }) =>
		!error.data && failureCount < 2,
	retryDelay: 2000,
};
