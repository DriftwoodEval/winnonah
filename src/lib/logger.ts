import pino, { type Logger } from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger: Logger = isProd
	? pino(
			{ level: "debug", base: null },
			pino.multistream([
				{ stream: process.stdout },
				{
					stream: pino.destination({
						dest: "/app/logs/debug.log",
						sync: false,
					}),
				},
			]),
		)
	: pino({
			transport: {
				target: "pino-pretty",
				options: { colorize: true, singleLine: true },
			},
			level: "debug",
		});
