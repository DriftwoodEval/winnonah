import fs from "node:fs";
import { createRequire } from "node:module";
import { generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "~/env";
import * as schema from "~/server/db/schema";

const require = createRequire(import.meta.url);
const Asana = require("asana");
const asanaClient = Asana.ApiClient.instance;
asanaClient.authentications.token.accessToken = env.ASANA_TOKEN;

interface UnmatchedLog {
  asanaProjectId: string;
  asanaProjectName: string;
  reason: string;
  html_content: string | null;
}

const getAllProjectsFromAsana = async () => {
  console.log("Fetching all projects from Asana...");
  const projectsApiInstance = new Asana.ProjectsApi();
  // biome-ignore lint/suspicious/noExplicitAny: asana API is not typed
  const allProjects: any[] = [];

  const opts = {
    opt_fields: "name,gid,html_notes,color",
    workspace: env.ASANA_WORKSPACE,
    limit: 100,
  };
  let response = await projectsApiInstance.getProjects(opts);
  allProjects.push(...response.data);

  while (response._response.next_page) {
    const offset = response._response.next_page.offset;
    response = await projectsApiInstance.getProjects({ ...opts, offset });
    allProjects.push(...response.data);
  }
  console.log(`✅ Fetched ${allProjects.length} total projects from Asana.`);
  return allProjects;
};

const runMigration = async () => {
  console.log("🚀 Starting Asana notes migration for EXISTING clients...");

  const connection = await mysql.createConnection(env.DATABASE_URL);
  const db = drizzle(connection, { schema, mode: "default" });
  console.log("✅ Database connection established.");

  const asanaProjects = await getAllProjectsFromAsana();
  const unmatchedLogs: UnmatchedLog[] = [];
  let updatedClients = 0;
  let migratedNotes = 0;

  for (const project of asanaProjects) {
    let { gid: asanaId, name, html_notes, color: asanaColor } = project;

    asanaColor =
      asanaColor === "dark-teal"
        ? "aqua"
        : asanaColor === "light-blue"
        ? "blue"
        : asanaColor === "light-purple"
        ? "purple"
        : asanaColor ?? "none";

    try {
      // Step 1: Find an EXISTING client with the matching Asana ID.
      const client = await db.query.clients.findFirst({
        where: eq(schema.clients.asanaId, asanaId),
      });

      // Step 2: If no client is found, log it and skip to the next project.
      if (!client) {
        unmatchedLogs.push({
          asanaProjectId: asanaId,
          asanaProjectName: name,
          reason: "Client with this Asana ID was not found in the database.",
          html_content: html_notes,
        });
        continue;
      }

      // Step 3: If a client IS found, update their color.
      await db
        .update(schema.clients)
        .set({ color: asanaColor })
        .where(eq(schema.clients.id, client.id));

      updatedClients++;
      console.log(
        `🎨 Updated color for client: ${client.fullName} (ID: ${client.id})`
      );

      // Step 4: Proceed with note migration for this existing client.
      if (!html_notes || html_notes.trim() === "<body></body>") {
        continue; // No note content to migrate
      }

      const existingNote = await db.query.notes.findFirst({
        where: eq(schema.notes.clientId, client.id),
      });

      if (existingNote) {
        console.log(
          `⚠️ Note for client ${client.id} already exists. Skipping.`
        );
        continue;
      }

      const cleanedHtml = html_notes
        .replace(/^<body.*?>|<\/body>$/gs, "")
        .trim()
        .split(/\r?\n/)
        .map((line: string) => `<p>${line}</p>`)
        .join("");
      const tiptapJson = generateJSON(cleanedHtml, [StarterKit]);

      await db.insert(schema.notes).values({
        clientId: client.id,
        content: tiptapJson,
      });

      migratedNotes++;
      console.log(
        `✅ Migrated note for client ID:  ${client.fullName} (ID: ${client.id})`
      );
    } catch (error) {
      console.error(
        `❌ An error occurred processing Asana project ${asanaId} (${name})`,
        error
      );
      unmatchedLogs.push({
        asanaProjectId: asanaId,
        asanaProjectName: name,
        reason: "An unexpected error occurred during processing.",
        html_content: html_notes,
      });
    }
  }

  // Save all unmatched/failed items to a file for review
  // TODO: Figure out how to resolve these (manually, on the website?)
  if (unmatchedLogs.length > 0) {
    fs.writeFileSync(
      "unmatched_migration_logs.json",
      JSON.stringify(unmatchedLogs, null, 2),
      "utf-8"
    );
    console.log(
      `\n🚨 Found ${unmatchedLogs.length} projects that need manual review. Details saved to unmatched_migration_logs.json`
    );
  }

  console.log(
    `\n🎉 Migration complete! Updated ${updatedClients} clients and migrated ${migratedNotes} new notes.`
  );
  await connection.end();
};

runMigration().catch((err) => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
