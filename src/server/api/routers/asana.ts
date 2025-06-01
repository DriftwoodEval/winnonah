import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
const Asana = require("asana");

const client = Asana.ApiClient.instance;
const token = client.authentications.token;
token.accessToken = env.ASANA_TOKEN;

const opts = { opt_fields: "name,color,permalink_url,notes" };
export const asanaRouter = createTRPCRouter({
	getProject: protectedProcedure.input(z.number()).query(async ({ input }) => {
		if (input === 0) {
			return null;
		}
		const projectsApiInstance = new Asana.ProjectsApi();
		const project = await projectsApiInstance.getProject(input, opts);
		return project;
	}),
});
