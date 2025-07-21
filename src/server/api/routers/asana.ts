import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { redis } from "~/server/lib/redis";

const Asana = require("asana");

const client = Asana.ApiClient.instance;
const token = client.authentications.token;
token.accessToken = env.ASANA_TOKEN;
const workspaceId = env.ASANA_WORKSPACE;

// CONFIGURATION
const CACHE_TTL_SECONDS = 300; // 5 minutes
const LOCK_TTL_SECONDS = 30;
const ALL_PROJECTS_CACHE_KEY = "asana:all_projects";
const FETCH_LOCK_KEY = "lock:asana:fetching_all_projects";
const projectCacheKey = (id: string) => `asana:project:${id}`;

const opts = {
  opt_fields: "name,color,permalink_url,notes,offset,html_notes",
  workspace: workspaceId,
  limit: 100,
};

// HELPER FUNCTIONS
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
  console.log(`Fetched ${allProjects.length} projects from Asana`);
  return allProjects;
};

const updateProject = async (
  id: string,
  data: { name?: string; html_notes?: string; color?: string }
) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const project = await projectsApiInstance.updateProject({ data }, id, opts);
  return project;
};

// TRPC ROUTER
export const asanaRouter = createTRPCRouter({
  getProject: protectedProcedure
    .input(z.string())
    .query(async ({ input: id }) => {
      if (!id) {
        return null;
      }

      const cacheKey = projectCacheKey(id);
      const cachedProject = await redis.get(cacheKey);
      if (cachedProject) {
        console.log(`CACHE HIT: ${cacheKey}`);
        return JSON.parse(cachedProject);
      }

      console.log(`CACHE MISS: ${cacheKey}`);
      const project = await getProjectFromAsana(id);

      if (project) {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(project));
      }

      return project;
    }),

  getAllProjects: protectedProcedure.query(async () => {
    const cachedProjects = await redis.get(ALL_PROJECTS_CACHE_KEY);
    if (cachedProjects) {
      console.log(`CACHE HIT: ${ALL_PROJECTS_CACHE_KEY}`);
      return JSON.parse(cachedProjects);
    }

    console.log(`CACHE MISS: ${ALL_PROJECTS_CACHE_KEY}.`);

    const lockAcquired = await redis.set(
      FETCH_LOCK_KEY,
      "true",
      "EX",
      LOCK_TTL_SECONDS,
      "NX"
    );

    if (lockAcquired) {
      console.log("Lock acquired. Fetching projects from Asana.");
      try {
        const projects = await getAllProjectsFromAsana();
        await redis.setex(
          ALL_PROJECTS_CACHE_KEY,
          CACHE_TTL_SECONDS,
          JSON.stringify(projects)
        );
        console.log(`CACHE SET: Cached ${projects.length} projects.`);
        return projects;
      } finally {
        await redis.del(FETCH_LOCK_KEY);
        console.log("Lock released.");
      }
    } else {
      console.log(
        "Could not acquire lock. Waiting for another instance to populate the cache."
      );
      for (let i = 0; i < 15; i++) {
        // Poll for up to 30 seconds
        await new Promise((res) => setTimeout(res, 2000)); // Wait 2s
        const projects = await redis.get(ALL_PROJECTS_CACHE_KEY);
        if (projects) {
          console.log("Cache populated by another instance. Returning data.");
          return JSON.parse(projects);
        }
      }
      throw new Error("Timed out waiting for cache to be populated.");
    }
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
      const individualProjectKey = projectCacheKey(id);
      const updatedProject = await updateProject(id, data);
      await redis.del(ALL_PROJECTS_CACHE_KEY, individualProjectKey);
      console.log(
        `CACHE INVALIDATED: ${ALL_PROJECTS_CACHE_KEY} and ${individualProjectKey}`
      );
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

      const individualProjectKey = projectCacheKey(projectId);
      await redis.del(ALL_PROJECTS_CACHE_KEY, individualProjectKey);
      console.log(
        `CACHE INVALIDATED: ${ALL_PROJECTS_CACHE_KEY} and ${individualProjectKey}`
      );
      return updatedProject;
    }),
});
