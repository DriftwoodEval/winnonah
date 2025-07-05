import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

const Asana = require("asana");

const client = Asana.ApiClient.instance;
const token = client.authentications.token;
token.accessToken = env.ASANA_TOKEN;

const opts = { opt_fields: "name,color,permalink_url,notes,html_notes,title" };

export const getProject = async (id: string) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const project = await projectsApiInstance.getProject(id, opts);
  return project;
};

export const updateProject = async (
  id: string,
  data: { name?: string; notes?: string }
) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const project = await projectsApiInstance.updateProject({ data }, id, opts);
  return project;
};

export const addClientIdToProject = async (
  projectId: string,
  clientId: number
) => {
  const project = await getProject(projectId);
  if (project) {
    if (project.data.name.includes(`[${clientId}]`)) return project;

    project.data.name = project.data.name.replace(/\s+/g, " ").trim();
    project.data.name += ` [${clientId}]`;
    const updatedProject = updateProject(projectId, {
      name: project.data.name,
    });
    return updatedProject;
  }
};

export const asanaRouter = createTRPCRouter({
  getProject: protectedProcedure.input(z.string()).query(async ({ input }) => {
    if (input === "") {
      return null;
    }
    return await getProject(input);
  }),
});
