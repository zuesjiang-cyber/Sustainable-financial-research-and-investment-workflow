import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/fintrust";
}

export function getPool(): pg.Pool {
  if (!poolInstance) {
    const connectionString = getDatabaseUrl();
    poolInstance = new Pool({
      connectionString,
      max: Number(process.env.PG_MAX_CONNECTIONS || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    poolInstance.on("error", (err) => {
      console.error("[Database Pool Error]:", err);
    });
  }
  return poolInstance;
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  const pool = getPool();
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true };
    } finally {
      client.release();
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[Database Rollback Error]:", rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve("db/migrations");
  try {
    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const pool = getPool();
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
      await pool.query(sql);
      console.log(`[Migration] Applied ${file}`);
    }
  } catch (err) {
    console.error("[Migration Error]:", err);
    throw err;
  }
}
