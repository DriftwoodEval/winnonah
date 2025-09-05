import * as fs from "node:fs/promises";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InferInsertModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { clients, notes } from "~/server/db/schema";

type RawNoteEntry = {
  name: string;
  title: string;
  url: string;
};

type NoteInsert = InferInsertModel<typeof notes>;

type UnprocessedEntry = {
  reason: string;
  entry: RawNoteEntry;
};

async function importNotes() {
  const logFile = "unprocessed_notes.json";
  const unprocessedEntries: UnprocessedEntry[] = [];

  try {
    const filePath = path.join(
      dirname(fileURLToPath(import.meta.url)),
      "notes.json"
    );
    console.log(`Reading JSON file from: ${filePath}...`);

    try {
      await fs.access(filePath);
    } catch {
      throw new Error(
        `File not found at ${filePath}. Please ensure 'notes.json' is in the same directory as the script.`
      );
    }

    const fileContent = await fs.readFile(filePath, "utf-8");
    const jsonData: RawNoteEntry[] = JSON.parse(fileContent);

    console.log(`Found ${jsonData.length} entries in the JSON file.`);
    console.log("Processing entries and inserting valid notes...");

    for (const entry of jsonData) {
      if (entry.title === "Project description") {
        console.log(`➡️ Skipping entry with title "Project description".`);
        // unprocessedEntries.push({
        //   reason: 'Title is "Project description"',
        //   entry,
        // });
        continue;
      }

      let clientId: number | null = null;
      let asanaId: string | null = null;
      const idRegex = /\[(\d+)\]/;
      const idMatch = entry.name.match(idRegex);
      if (idMatch?.[1]) {
        clientId = parseInt(idMatch[1], 10);
      }

      if (!clientId) {
        const urlRegex = /\/(\d+)$/;
        const urlMatch = entry.url?.match(urlRegex);
        if (urlMatch?.[1]) {
          asanaId = urlMatch[1];
        }
      }

      let clientExists = null;

      if (clientId) {
        clientExists = await db.query.clients.findFirst({
          where: sql`${clients.id} = ${clientId}`,
        });
      } else if (asanaId) {
        clientExists = await db.query.clients.findFirst({
          where: sql`${clients.asanaId} = ${asanaId}`,
        });
      }

      if (clientExists) {
        const noteToInsertOrUpdate: NoteInsert = {
          clientId: clientExists.id,
          title: entry.title,
          content: {},
        };

        await db
          .insert(notes)
          .values(noteToInsertOrUpdate)
          .onDuplicateKeyUpdate({
            set: {
              title: noteToInsertOrUpdate.title,
            },
          });

        console.log(
          `✅ Note for client ID ${clientExists.id} inserted or updated.`
        );
      } else {
        let reason = "No valid client ID or Asana ID found";
        if (clientId) {
          reason = `Client ID ${clientId} not found in the database`;
        } else if (asanaId) {
          reason = `Asana ID ${asanaId} not found in the database`;
        }
        console.log(`❌ Client not found. Logging entry.`);
        unprocessedEntries.push({ reason, entry });
      }
    }

    if (unprocessedEntries.length > 0) {
      await fs.writeFile(
        logFile,
        JSON.stringify(unprocessedEntries, null, 2),
        "utf-8"
      );
      console.log(`Unprocessed entries logged to ${logFile}`);
    }

    console.log("✅ Notes import process completed.");
  } catch (error) {
    console.error("❌ Failed to import notes:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

importNotes();
