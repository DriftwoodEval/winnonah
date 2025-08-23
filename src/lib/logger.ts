import pino, { type Logger } from "pino";

export const logger: Logger =
  process.env.NODE_ENV === "production"
    ? // JSON in production
      pino({ level: "info" })
    : // Pretty in development
      pino({
        transport: {
          target: "pino-pretty",
          options: { colorize: true, singleLine: true },
        },
        level: "debug",
      });
