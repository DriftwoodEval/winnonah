import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { redis } from "~/server/lib/redis";

const Asana = require("asana");

const client = Asana.ApiClient.instance;
const token = client.authentications.token;
token.accessToken = env.ASANA_TOKEN;
const workspaceId = env.ASANA_WORKSPACE;
const opts = {
  opt_fields: "name,color,permalink_url,notes,offset,html_notes",
  workspace: workspaceId,
  limit: 100,
};

const CACHE_TTL_SECONDS = 300; // 5 minutes
const PROJECT_KEY_PREFIX = "project:";
const ALL_PROJECTS_IDS_KEY = "projects:all_ids";

const getProjectFromAsana = async (id: string) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const { data } = await projectsApiInstance.getProject(id, opts);
  return data;
};

const getAllProjectsFromAsana = async () => {
  console.log("Fetching all projects from Asana");
  const projectsApiInstance = new Asana.ProjectsApi();
  // biome-ignore lint/suspicious/noExplicitAny: Asana API is not typed
  const allProjects: any[] = [];
  const projectIds: string[] = [];
  let response = await projectsApiInstance.getProjects(opts);
  allProjects.push(...response.data);

  while (response._response.next_page) {
    const offset = response._response.next_page.offset;
    response = await projectsApiInstance.getProjects({
      ...opts,
      offset: offset,
    });
    allProjects.push(...response.data);
  }

  for (const project of allProjects) {
    projectIds.push(project.gid);
  }

  return { allProjects, projectIds };
};

const invalidateProjectCache = async (id: string) => {
  const projectKey = `${PROJECT_KEY_PREFIX}${id}`;
  await redis.del(projectKey, ALL_PROJECTS_IDS_KEY);
  console.log(
    `CACHE INVALIDATED for: ${projectKey} and ${ALL_PROJECTS_IDS_KEY}`
  );
};

const updateProject = async (
  id: string,
  data: { name?: string; html_notes?: string; color?: string }
) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const project = await projectsApiInstance.updateProject({ data }, id, opts);
  return project;
};

export const asanaRouter = createTRPCRouter({
  getProject: protectedProcedure
    .input(z.string())
    .query(async ({ input: id }) => {
      if (!id) {
        return null;
      }

      const cacheKey = `${PROJECT_KEY_PREFIX}${id}`;
      const cachedProject = await redis.get(cacheKey);
      if (cachedProject) {
        console.log(`CACHE HIT: ${cacheKey}`);
        return JSON.parse(cachedProject);
      }

      console.log(`CACHE MISS: ${cacheKey}`);
      const project = await getProjectFromAsana(id);

      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(project));
      return project;
    }),

  getAllProjects: protectedProcedure
    .input(z.boolean().optional())
    .query(async ({ input: forceRefresh }) => {
      if (forceRefresh) {
        console.log("CACHE CLEAR: Forcing refresh for all projects.");
        const allProjectKeys = await redis.keys(`${PROJECT_KEY_PREFIX}*`);
        if (allProjectKeys.length > 0) {
          await redis.del(...allProjectKeys, ALL_PROJECTS_IDS_KEY);
        }
      }

      const cachedProjectIds = await redis.get(ALL_PROJECTS_IDS_KEY);
      if (cachedProjectIds) {
        console.log(`CACHE HIT: ${ALL_PROJECTS_IDS_KEY}`);
        const projectIds = JSON.parse(cachedProjectIds) as string[];
        if (projectIds.length === 0) return [];

        const projectKeys = projectIds.map(
          (id) => `${PROJECT_KEY_PREFIX}${id}`
        );
        const cachedProjects = await redis.mget(...projectKeys);
        return cachedProjects.filter((p) => p).map((p) => JSON.parse(p ?? ""));
      }

      console.log(`CACHE MISS: ${ALL_PROJECTS_IDS_KEY}.`);
      const { allProjects, projectIds } = await getAllProjectsFromAsana();

      if (allProjects.length > 0) {
        const pipeline = redis.pipeline();
        for (const project of allProjects) {
          pipeline.setex(
            `${PROJECT_KEY_PREFIX}${project.gid}`,
            CACHE_TTL_SECONDS,
            JSON.stringify(project)
          );
        }
        pipeline.setex(
          ALL_PROJECTS_IDS_KEY,
          CACHE_TTL_SECONDS,
          JSON.stringify(projectIds)
        );
        await pipeline.exec();
        console.log(
          `CACHE SET: Cached ${allProjects.length} projects and their IDs.`
        );
      }

      return allProjects;
    }),

  updateProject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        html_notes: z.string().optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;

      const updatedProject = await updateProject(id, data);
      await invalidateProjectCache(id);
      return updatedProject;
    }),

  addClientId: protectedProcedure
    .input(z.object({ projectId: z.string(), clientId: z.number() }))
    .mutation(async ({ input }) => {
      const { projectId, clientId } = input;
      const project = await getProjectFromAsana(projectId);

      if (project?.name?.includes(`[${clientId}]`)) {
        return project; //Already has an ID in the name
      }

      const newName = `${project.name
        .replace(/\s+/g, " ")
        .trim()} [${clientId}]`;

      const updatedProject = await updateProject(projectId, {
        name: newName,
      });

      await invalidateProjectCache(projectId);
      return updatedProject;
    }),
});
