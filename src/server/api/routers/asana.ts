import { z } from "zod";
import { env } from "~/env";
import { logger } from "~/lib/logger";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { redis } from "~/server/lib/redis";

const Asana = require("asana");

const log = logger.child({ module: "trpc" });

const client = Asana.ApiClient.instance;
client.authentications.token.accessToken = env.ASANA_TOKEN;
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
  log.info({ id: id }, "Fetching project from Asana");
  const projectsApiInstance = new Asana.ProjectsApi();
  const { data } = await projectsApiInstance.getProject(id, opts);
  return data;
};

const getAllProjectsFromAsana = async () => {
  log.info("Fetching all projects from Asana");
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
  log.info(`Fetched ${allProjects.length} projects from Asana`);
  return allProjects;
};

const updateProject = async (
  id: string,
  data: { name?: string; html_notes?: string; color?: string }
) => {
  const projectsApiInstance = new Asana.ProjectsApi();
  const project = await projectsApiInstance.updateProject({ data }, id, opts);
  log.info({ id: id }, "Updated project in Asana");
  return project;
};

const updateCachedProjects = async (updatedProject: { gid: string }) => {
  await redis.setex(
    projectCacheKey(updatedProject.gid),
    CACHE_TTL_SECONDS,
    JSON.stringify(updatedProject)
  );
  log.info(
    { id: updatedProject.gid, cacheKey: projectCacheKey(updatedProject.gid) },
    "Cache set"
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
      log.info(
        { id: updatedProject.gid, cacheKey: ALL_PROJECTS_CACHE_KEY },
        "Cache set"
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
        log.info({ cacheKey: cacheKey }, "Cache hit");
        return JSON.parse(cachedProject);
      }

      log.info({ cacheKey: cacheKey }, "Cache miss");
      const project = await getProjectFromAsana(id);

      if (project) {
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(project));
        log.info({ cacheKey: cacheKey }, "Cache set");
      }

      return project;
    }),

  getAllProjects: protectedProcedure.query(async () => {
    const cachedProjects = await redis.get(ALL_PROJECTS_CACHE_KEY);
    if (cachedProjects) {
      log.info({ cacheKey: ALL_PROJECTS_CACHE_KEY }, "Cache hit");
      return JSON.parse(cachedProjects);
    }

    log.info({ cacheKey: ALL_PROJECTS_CACHE_KEY }, "Cache miss");

    const lockAcquired = await redis.set(
      FETCH_LOCK_KEY,
      "true",
      "EX",
      LOCK_TTL_SECONDS,
      "NX"
    );

    if (lockAcquired) {
      log.info("Lock acquired. Fetching projects from Asana.");
      try {
        const projects = await getAllProjectsFromAsana();
        await redis.setex(
          ALL_PROJECTS_CACHE_KEY,
          CACHE_TTL_SECONDS,
          JSON.stringify(projects)
        );
        log.info(`Cache set: Cached ${projects.length} projects.`);
        return projects;
      } finally {
        await redis.del(FETCH_LOCK_KEY);
        log.info("Lock released.");
      }
    } else {
      log.warn(
        "Could not acquire lock. Waiting for another instance to populate the cache."
      );
      for (let i = 0; i < 15; i++) {
        // Poll for up to 30 seconds
        await new Promise((res) => setTimeout(res, 2000)); // Wait 2s
        const projects = await redis.get(ALL_PROJECTS_CACHE_KEY);
        if (projects) {
          log.info("Cache populated by another instance. Returning data.");
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
        sent: z.date().optional(),
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

      const sentString = (input.sent || new Date()).toLocaleDateString(
        "en-US",
        {
          month: "2-digit",
          day: "2-digit",
        }
      );

      const sentTitle = `${sentString} Qs sent ${
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
        (line: string) => line.trim() === sentTitle
      );

      if (existingTitleIndex !== -1) {
        let insertionIndex = existingTitleIndex + 1;

        while (insertionIndex < notesByLine.length) {
          const currentLine = notesByLine[insertionIndex].trim();

          const isLinkLine = /^<a href/i.test(currentLine);

          if (isLinkLine) {
            insertionIndex++;
          } else {
            break;
          }
        }

        notesByLine.splice(insertionIndex, 0, ...newQuestionnaireLinks);
      } else {
        const newContentBlock = [sentTitle, ...newQuestionnaireLinks];

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
