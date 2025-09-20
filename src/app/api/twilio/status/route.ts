import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import twilio from "twilio";
import { env } from "~/env";
import { db } from "~/server/db";
import { sms } from "~/server/db/schema";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const twilioSignature = req.headers.get("X-Twilio-Signature");

  const forwardedProto = req.headers.get("X-Forwarded-Proto");
  const forwardedHost = req.headers.get("X-Forwarded-Host");
  const host = forwardedHost || req.headers.get("host") || "";
  const proto = forwardedProto || "https";

  const absoluteUrl = `${proto}://${host}/api/twilio/status`;

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

  const messageStatus = formData.MessageStatus?.toString();
  const messageSid = formData.MessageSid?.toString();

  if (!messageStatus || !messageSid) {
    return new Response(null, { status: 400 });
  }

  await db
    .update(sms)
    .set({ messageStatus })
    .where(eq(sms.messageSid, messageSid));

  return new Response(null, { status: 200 });
}
