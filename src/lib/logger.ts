import pino, { type Logger } from "pino";

export const logger: Logger =
	process.env.NODE_ENV === "production"
		? // JSON in production
			pino({
				base: null,
				transport: {
					targets: [
						{ target: "pino/file", options: { destination: "logs/debug.log" } },
						{ target: "pino/file", options: { destination: 1 } },
					],
				},
				level: "debug",
			})
		: // Pretty in development
			pino({
				base: null,
				transport: {
					target: "pino-pretty",
					options: { colorize: true, singleLine: true },
				},
				level: "debug",
			});
