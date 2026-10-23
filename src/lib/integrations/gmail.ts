import { OAuth2Client } from "google-auth-library";
import type { Session } from "next-auth";
import { env } from "~/env";

interface EmailAttachment {
	filename: string;
	contentType: string;
	base64: string;
}

interface OutgoingEmail {
	to: string;
	cc: string[];
	subject: string;
	text: string;
	attachments?: EmailAttachment[];
}

/** Encodes a header value that may contain non-ASCII characters (RFC 2047). */
function encodeHeader(value: string) {
	return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Wraps base64 text at 76 characters per line, as MIME requires. */
function wrapBase64(base64: string) {
	return base64.replace(/(.{76})/g, "$1\r\n");
}

function buildMime(email: OutgoingEmail) {
	const boundary = `boundary-${crypto.randomUUID()}`;
	const headers = [
		`To: ${email.to}`,
		...(email.cc.length > 0 ? [`Cc: ${email.cc.join(", ")}`] : []),
		`Subject: ${encodeHeader(email.subject)}`,
		"MIME-Version: 1.0",
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
	];
	const parts = [
		[
			`--${boundary}`,
			'Content-Type: text/plain; charset="UTF-8"',
			"Content-Transfer-Encoding: base64",
			"",
			wrapBase64(Buffer.from(email.text, "utf8").toString("base64")),
		].join("\r\n"),
	];
	for (const { filename, contentType, base64 } of email.attachments ?? []) {
		parts.push(
			[
				`--${boundary}`,
				`Content-Type: ${contentType}; name="${filename}"`,
				`Content-Disposition: attachment; filename="${filename}"`,
				"Content-Transfer-Encoding: base64",
				"",
				wrapBase64(base64),
			].join("\r\n"),
		);
	}
	return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}\r\n--${boundary}--`;
}

/**
 * Sends an email from the signed-in user's own Gmail account. Throws a
 * `GmailScopeError` when the user has not yet granted permission to send.
 */
export async function sendGmailAsUser(session: Session, email: OutgoingEmail) {
	if (!session.user.accessToken || !session.user.refreshToken) {
		throw new Error("Missing Google credentials for sending email.");
	}

	const oauth2Client = new OAuth2Client({
		clientId: env.AUTH_GOOGLE_ID,
		clientSecret: env.AUTH_GOOGLE_SECRET,
	});
	oauth2Client.setCredentials({
		access_token: session.user.accessToken,
		refresh_token: session.user.refreshToken,
	});

	const raw = Buffer.from(buildMime(email), "utf8").toString("base64url");
	try {
		await oauth2Client.request({
			url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
			method: "POST",
			data: { raw },
		});
	} catch (error) {
		const status = (error as { response?: { status?: number } }).response
			?.status;
		if (status === 403) throw new GmailScopeError();
		throw error;
	}
}

export class GmailScopeError extends Error {
	constructor() {
		super("Google has not allowed this account to send email yet.");
	}
}
