import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { DEFAULT_LOCAL_WORKSPACE } from "../src/server/repos/workspaceContext";

export interface MigrationSummary {
  projectsMigrated: number;
  thesesMigrated: number;
  questionsMigrated: number;
  dbPath: string;
}

export async function runLegacyMigration(dbPath?: string): Promise<MigrationSummary> {
  const targetDb = dbPath || path.resolve("fintrust.db");
  if (!fs.existsSync(targetDb)) {
    console.log(`[Migration] Legacy database ${targetDb} not found. Skipping.`);
    return { projectsMigrated: 0, thesesMigrated: 0, questionsMigrated: 0, dbPath: targetDb };
  }

  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(targetDb);
  const db = new SQL.Database(filebuffer);

  let projectsMigrated = 0;
  let thesesMigrated = 0;
  let questionsMigrated = 0;

  try {
    const projResults = db.exec("SELECT * FROM projects");
    if (projResults.length > 0 && projResults[0].values) {
      projectsMigrated = projResults[0].values.length;
    }

    const thesisResults = db.exec("SELECT * FROM theses");
    if (thesisResults.length > 0 && thesisResults[0].values) {
      thesesMigrated = thesisResults[0].values.length;
    }

    const questionResults = db.exec("SELECT * FROM questions");
    if (questionResults.length > 0 && questionResults[0].values) {
      questionsMigrated = questionResults[0].values.length;
    }

    console.log(`[Migration] Read-only scan of ${targetDb}:`);
    console.log(`  - Projects: ${projectsMigrated}`);
    console.log(`  - Theses: ${thesesMigrated}`);
    console.log(`  - Questions: ${questionsMigrated}`);
  } finally {
    db.close();
  }

  return {
    projectsMigrated,
    thesesMigrated,
    questionsMigrated,
    dbPath: targetDb,
  };
}

if (process.argv[1]?.includes("migrate-legacy.ts")) {
  runLegacyMigration().catch(console.error);
}
