import twilio from "twilio";
import z from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sms } from "~/server/db/schema";

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

const sendSMS = async (to: string, body: string) => {
  return twilioClient.messages.create({
    body,
    from: env.TWILIO_PHONE_NUMBER,
    to,
    statusCallback: "https://dev.winnonah.xyz/api/twilio/status",
  });
};

export const twilioRouter = createTRPCRouter({
  sendSMS: protectedProcedure
    .input(
      z.object({
        to: z.string(),
        body: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const message = await sendSMS(input.to, input.body);

      await ctx.db.insert(sms).values({
        from: message.from,
        to: message.to,
        body: message.body,
        messageStatus: message.status,
        messageSid: message.sid,
        accountSid: message.accountSid,
      });
    }),
});
