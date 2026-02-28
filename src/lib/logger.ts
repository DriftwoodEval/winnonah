import pino, { type Logger } from "pino";

// Check if we are running on the Node.js server or in the browser
const isServer = typeof window === "undefined";

export const logger: Logger =
	process.env.NODE_ENV === "production"
		? pino(
				{ base: null, level: "debug" },
				// Only use multistream and file destinations on the server.
				// In the browser, passing 'undefined' makes Pino default to console.log
				isServer
					? pino.multistream([
							{ stream: process.stdout },
							{ stream: pino.destination("/app/logs/debug.log") },
						])
					: undefined,
			)
		: pino({
				base: null,
				level: "debug",
				// pino-pretty also requires Node.js worker threads, so disable it in the browser
				transport: isServer
					? {
							target: "pino-pretty",
							options: { colorize: true, singleLine: true },
						}
					: undefined,
			});
