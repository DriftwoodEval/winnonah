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

const updateCachedProjects = async (updatedProject: { gid: string }) => {
  await redis.setex(
    projectCacheKey(updatedProject.gid),
    CACHE_TTL_SECONDS,
    JSON.stringify(updatedProject)
  );

  const allProjectsStr = await redis.get(ALL_PROJECTS_CACHE_KEY);
  if (allProjectsStr) {
    // biome-ignore lint/suspicious/noExplicitAny: Asana API is not typed
    const allProjects: any[] = JSON.parse(allProjectsStr);
    const projectIndex = allProjects.findIndex(
      (p) => p.gid === updatedProject.gid
    );

    if (projectIndex !== -1) {
      allProjects[projectIndex] = updatedProject;
      await redis.setex(
        ALL_PROJECTS_CACHE_KEY,
        CACHE_TTL_SECONDS,
        JSON.stringify(allProjects)
      );
      console.log(
        `CACHE UPDATED: Project ${updatedProject.gid} in ${ALL_PROJECTS_CACHE_KEY}`
      );
    }
  }
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
      const updatedProject = await updateProject(id, data);
      await updateCachedProjects(updatedProject.data);
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

      await updateCachedProjects(updatedProject.data);
      return updatedProject;
    }),

  addQuestionnaires: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        automatic: z.boolean(),
        questionnaires: z.array(
          z.object({
            link: z.url(),
            type: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { projectId, questionnaires } = input;

      if (!projectId || questionnaires.length === 0) {
        return null;
      }

      const user = ctx.session.user;

      const userInitials =
        user?.name
          ?.split(" ")
          .map((namePart) => namePart?.[0])
          .join("") ?? "";

      const today = new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
      });

      const todayTitle = `${today} Qs sent ${
        input.automatic ? "automatically" : userInitials
      }`;

      const newQuestionnaireLinks = questionnaires.map(
        (item) => `<a href='${item.link}'>${item.link}</a> - ${item.type}`
      );

      const currentProject = await getProjectFromAsana(projectId);
      const currentNotes = currentProject.html_notes || "";
      const cleanedNotes = currentNotes
        .replace(/^<body.*?>|<\/body>$/gs, "")
        .trim();
      const notesByLine = cleanedNotes.split("\n");

      const existingTitleIndex = notesByLine.findIndex(
        (line: string) => line.trim() === todayTitle
      );

      if (existingTitleIndex !== -1) {
        notesByLine.splice(existingTitleIndex + 1, 0, ...newQuestionnaireLinks);
      } else {
        const newContentBlock = [todayTitle, ...newQuestionnaireLinks];

        const blankLineIndex = notesByLine
          .slice(0, 5)
          .findIndex((line: string) => !line.trim());

        if (blankLineIndex !== -1) {
          notesByLine.splice(blankLineIndex + 1, 0, ...newContentBlock, "");
        } else {
          notesByLine.unshift(...newContentBlock, "");
        }
      }

      const finalHtmlNotes = `<body>${notesByLine.join("\n")}</body>`;
      const updatedProject = await updateProject(projectId, {
        html_notes: finalHtmlNotes,
      });

      await updateCachedProjects(updatedProject.data);
      return updatedProject;
    }),
});
