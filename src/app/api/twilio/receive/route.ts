import type { NextRequest } from "next/server";
import twilio, { twiml } from "twilio";
import { env } from "~/env";
import { db } from "~/server/db";
import { sms } from "~/server/db/schema";

const { MessagingResponse } = twiml;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const twilioSignature = req.headers.get("X-Twilio-Signature");

  const forwardedProto = req.headers.get("X-Forwarded-Proto");
  const forwardedHost = req.headers.get("X-Forwarded-Host");
  const host = forwardedHost || req.headers.get("host") || "";
  const proto = forwardedProto || "https";

  const absoluteUrl = `${proto}://${host}/api/twilio/receive`;

  const authToken = env.TWILIO_AUTH_TOKEN;

  if (!authToken || !twilioSignature) {
    return new Response("Authentication details missing.", { status: 400 });
  }

  const formData = Object.fromEntries(new URLSearchParams(rawBody));

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    absoluteUrl,
    formData
  );

  if (!isValid) {
    return new Response("Invalid Twilio signature.", { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const messageBody = params.get("Body") || "";

  await db.insert(sms).values({
    from: params.get("From") || "",
    to: params.get("To") || "",
    body: messageBody,
    messageSid: params.get("MessageSid") || "",
    accountSid: params.get("AccountSid") || "",
  });

  const twiml = new MessagingResponse();

  return new Response(twiml.toString(), {
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
