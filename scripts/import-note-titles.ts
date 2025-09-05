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
};

type NoteInsert = InferInsertModel<typeof notes>;

type UnprocessedEntry = {
  reason: string;
  entry: RawNoteEntry;
};

const TITLE_MAX_LENGTH = 255;

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

      if (entry.title && entry.title.length > TITLE_MAX_LENGTH) {
        console.log(
          `➡️ Skipping entry because title is too long (${entry.title.length} chars).`
        );
        unprocessedEntries.push({
          reason: `Title exceeds max length of ${TITLE_MAX_LENGTH}`,
          entry,
        });
        continue;
      }

      const regex = /\[(\d+)\]/;
      const match = entry.name.match(regex);
      const clientId = match?.[1] ? parseInt(match[1], 10) : null;

      if (clientId) {
        const clientExists = await db.query.clients.findFirst({
          where: sql`${clients.id} = ${clientId}`,
        });

        if (clientExists) {
          const noteToInsertOrUpdate: NoteInsert = {
            clientId: clientId,
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

          console.log(`✅ Note for client ID ${clientId} inserted or updated.`);
        } else {
          console.log(`❌ Client ID ${clientId} not found. Logging entry.`);
          unprocessedEntries.push({
            reason: `Client ID ${clientId} not found in the database`,
            entry,
          });
        }
      } else {
        console.log(`❌ No client ID found in '${entry.name}'. Logging entry.`);
        unprocessedEntries.push({
          reason: "No valid client ID found in the name field",
          entry,
        });
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
