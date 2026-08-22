import pino, { type Logger } from "pino";

// Check if we are running on the Node.js server or in the browser
const isServer = typeof window === "undefined";

// Field names that carry client PHI. Routers commonly log a whole mutation
// `input` object (e.g. `ctx.logger.info(input, "Updating client")`), which
// merges these fields into the top level of the log record, or one level
// down under a wrapper key (`*`). Redact both shapes so PHI never lands in
// debug.log or stdout regardless of which router does the logging.
const phiFields = [
	"dob",
	"firstName",
	"lastName",
	"preferredName",
	"fullName",
	"address",
	"primaryInsurance",
	"secondaryInsurance",
	"phoneNumber",
	"email",
	"insuranceNumber",
	"planName",
	"policyCompanyName",
];
const redact = {
	paths: [...phiFields, ...phiFields.map((f) => `*.${f}`)],
	censor: "[REDACTED]",
};

export const logger: Logger =
	process.env.NODE_ENV === "production"
		? pino(
				{
					base: null,
					level: "debug",
					messageKey: "message",
					redact,
					serializers: {
						error: pino.stdSerializers.err,
					},
					formatters: {
						level(label) {
							return {
								level: label === "warn" ? "WARNING" : label.toUpperCase(),
							};
						},
					},
				},
				// Only use multistream and file destinations on the server.
				// In the browser, passing 'undefined' makes Pino default to console.log
				isServer
					? pino.multistream([
							{ level: "debug", stream: process.stdout },
							{
								level: "debug",
								stream: pino.destination({
									dest: "/app/logs/debug.log",
									mkdir: true,
								}),
							},
						])
					: undefined,
			)
		: pino({
				base: null,
				level: "debug",
				redact,
				serializers: {
					error: pino.stdSerializers.err,
				},
				// pino-pretty also requires Node.js worker threads, so disable it in the browser
				transport: isServer
					? {
							target: "pino-pretty",
							options: { colorize: true, singleLine: true },
						}
					: undefined,
			});
