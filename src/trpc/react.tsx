"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	httpBatchStreamLink,
	httpSubscriptionLink,
	loggerLink,
	splitLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useEffect, useState } from "react";
import SuperJSON from "superjson";

import { installClientErrorLog } from "~/lib/client-error-log";
import type { AppRouter } from "~/server/api/root";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = () => {
	if (typeof window === "undefined") {
		// Server: always make a new query client
		return createQueryClient();
	}
	// Browser: use singleton pattern to keep the same query client
	clientQueryClientSingleton ??= createQueryClient();

	return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export function TRPCReactProvider(props: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	useEffect(installClientErrorLog, []);

	const [trpcClient] = useState(() =>
		api.createClient({
			links: [
				// Failed calls go through console.error, where the issue report's
				// error log picks them up.
				loggerLink({
					enabled: (op) =>
						op.direction === "down" && op.result instanceof Error,
					logger: (op) => {
						if (op.direction === "down" && op.result instanceof Error) {
							console.error(
								`tRPC ${op.type} ${op.path} failed: ${op.result.message}`,
							);
						}
					},
				}),
				splitLink({
					condition: (op) => op.type === "subscription",
					true: httpSubscriptionLink({
						url: `${getBaseUrl()}/api/trpc`,
						transformer: SuperJSON,
					}),
					false: httpBatchStreamLink({
						url: `${getBaseUrl()}/api/trpc`,
						transformer: SuperJSON,
					}),
				}),
			],
		}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<api.Provider client={trpcClient} queryClient={queryClient}>
				{props.children}
			</api.Provider>
		</QueryClientProvider>
	);
}

function getBaseUrl() {
	if (typeof window !== "undefined") return window.location.origin;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return `http://localhost:${process.env.PORT ?? 3000}`;
}
