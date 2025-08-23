import { TRPCError } from "@trpc/server";
import { subMonths, subYears } from "date-fns";
import {
  and,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  like,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { Phone } from "lucide-react";
import { z } from "zod";
import { env } from "~/env";
import { CLIENT_COLOR_KEYS } from "~/lib/colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators } from "~/server/db/schema";
import { fetchWithCache } from "~/server/lib/cache";

export const openPhoneRouter = createTRPCRouter({
  getMessages: protectedProcedure
    .input(
      z.object({
        // phoneNumberId: z.string(),
        participants: z.array(z.string()),
      })
    )
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        phoneNumberId: env.OPENPHONE_NUMBER_ID,
      });

      input.participants.forEach((p) => {
        params.append("participants", p);
        return;
      });

      const MESSAGE_CACHE_KEY = `openphone:messages:${params.toString()}`;

      return fetchWithCache(ctx, MESSAGE_CACHE_KEY, async () => {
        const url = `https://api.openphone.com/v1/messages?${params.toString()}`;

        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: env.OPENPHONE_API_TOKEN,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              `OpenPhone API Error: ${response.statusText} - ${JSON.stringify(
                errorData
              )}`
            );
          }

          const { data } = await response.json();
          return data;
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(`Failed to fetch messages: ${error.message}`);
          }
          throw new Error("An unknown error ocurred while fetching messages.");
        }
      });
    }),
});
