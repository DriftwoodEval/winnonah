import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Offices } from "~/server/lib/types";

const officeAddresses = env.OFFICE_ADDRESSES || "";
export const ALL_OFFICES: Offices = officeAddresses
  .split(";")
  .reduce((acc: Offices, address) => {
    const [key, ...values] = address.split(":");
    const [latitude, longitude, prettyName] = (values[0] ?? "").split(",");
    if (
      key !== undefined &&
      latitude !== undefined &&
      longitude !== undefined &&
      prettyName !== undefined
    ) {
      acc[key] = { latitude, longitude, prettyName };
    }
    return acc;
  }, {});

export const officeRouter = createTRPCRouter({
  getAll: protectedProcedure.query(() => {
    return ALL_OFFICES;
  }),
});
